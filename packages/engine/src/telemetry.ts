// ---------------------------------------------------------------------------
// TelemetrySink — pluggable observability backend for hot-path counters
// ---------------------------------------------------------------------------
//
// Why this module exists
// ----------------------
// PR 5 of the scaling spec adds structured counters/gauges/histograms to
// the engine's hot paths (BlockVision retry, NAVI MCP, Anthropic usage).
// The engine package has no runtime dependency on any observability vendor —
// it can't import @vercel/analytics because it ships to the CLI and MCP
// server which have no Vercel runtime. The solution is the same pluggable
// injection pattern used for the cache stores:
//
//   - Default `NoopSink` does nothing (zero overhead for CLI/MCP/tests).
//   - Audric injects `VercelTelemetrySink` at engine init, which writes
//     structured `console.log` lines (ingested by Vercel Observability)
//     and calls `track()` for discrete events (Vercel Analytics).
//
// The interface is intentionally minimal. We don't need full OTel-style
// spans or trace IDs at 1k DAU — counters + histograms on the 10 key
// metrics listed in the spec are enough to answer every incident question
// this stack will face at this scale.
//
// Tag shape
// ---------
// Tags are flat key-value string pairs. This matches what both Vercel
// Observability (structured log fields) and @vercel/analytics `track()`
// natively consume. No nested objects, no arrays — keep it serializable.
//
// Naming convention (mirrors the spec counters table)
// ---------------------------------------------------
//   bv.requests         — BlockVision fetch attempts
//   bv.cache_hit        — wallet/defi cache reads
//   bv.cb_open          — circuit breaker state (gauge 0|1)
//   navi.requests       — NAVI MCP call attempts
//   navi.cache_hit      — NAVI cache reads
//   navi.cb_open        — NAVI CB state (gauge 0|1)
//   anthropic.tokens    — input/output/cache tokens
//   anthropic.latency_ms — per-turn latency (histogram)
//   upstash.requests    — store operations
//   cron.fin_ctx_shard_duration_ms — shard processing time (histogram)
//   cron.fin_ctx_users_processed   — users processed per shard
// ---------------------------------------------------------------------------

/** A flat tag bag. Values are strings for universal serialization. */
export type TelemetryTags = Record<string, string | number>;

/**
 * Pluggable telemetry backend.
 *
 * All methods are fire-and-forget — implementations MUST NOT throw.
 * Swallow errors internally and optionally log a warning; the hot path
 * should never fail because an observability call failed.
 */
export interface TelemetrySink {
  /**
   * Increment a named counter by 1 (or `value` if supplied).
   * Used for discrete countable events: requests, errors, cache hits.
   */
  counter(name: string, tags?: TelemetryTags, value?: number): void;

  /**
   * Record the current value of a gauge.
   * Used for point-in-time measurements: circuit-breaker open (0|1),
   * queue depths, active connections.
   */
  gauge(name: string, value: number, tags?: TelemetryTags): void;

  /**
   * Record a distribution sample (latency, sizes).
   * Implementations may bucket, percentile, or just counter/average.
   */
  histogram(name: string, value: number, tags?: TelemetryTags): void;
}

// ---------------------------------------------------------------------------
// No-op implementation — default for CLI, MCP, tests
// ---------------------------------------------------------------------------

class NoopTelemetrySink implements TelemetrySink {
  counter(_name: string, _tags?: TelemetryTags, _value?: number): void {}
  gauge(_name: string, _value: number, _tags?: TelemetryTags): void {}
  histogram(_name: string, _value: number, _tags?: TelemetryTags): void {}
}

// ---------------------------------------------------------------------------
// Module-level injection slot
// ---------------------------------------------------------------------------

let activeSink: TelemetrySink = new NoopTelemetrySink();

/**
 * Swap the active telemetry sink. Call once at engine init from a runtime
 * that wants to emit real metrics (e.g. Audric injecting `VercelTelemetrySink`).
 * Idempotent — calling again replaces the previous sink. Tests can inject
 * a spy sink and use `resetTelemetrySink()` to restore the noop default.
 */
export function setTelemetrySink(sink: TelemetrySink): void {
  activeSink = sink;
}

/** Returns the currently active sink. Used by hot-path instrumentation. */
export function getTelemetrySink(): TelemetrySink {
  return activeSink;
}

/** Restore the default noop sink. Used by test teardowns. */
export function resetTelemetrySink(): void {
  activeSink = new NoopTelemetrySink();
}
