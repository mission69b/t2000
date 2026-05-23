// ---------------------------------------------------------------------------
// BlockVision HTTP retry layer — circuit breaker + bounded backoff.
//
// Carved out of the legacy `blockvision-prices.ts` monster file
// (SPEC PIPELINE-AUDIT-PHASE-2 S1 / 2026-05-23) — this is a PURE FILE
// SPLIT, no logic changes. Every former import path keeps working via
// `packages/engine/src/blockvision-prices.ts` which now re-exports
// from `./blockvision/index.ts`.
//
// What lives here:
//   - `BLOCKVISION_BASE`       — the v2 Sui API root
//   - Retry tunables           — `BV_RETRY_*` (3 attempts, jittered backoff)
//   - Circuit breaker tunables — `CB_*` + per-process breaker state
//   - `fetchBlockVisionWithRetry` — the wrapper every BV call goes through
//   - `_resetBlockVisionCircuitBreaker` — test seam
//   - `parseNumberOrNull`      — tiny shared response-parsing helper used
//                                 by wallet.ts + prices.ts
//
// Module-level breaker state (`cb429Timestamps`, `cbOpenUntil`) is
// SHARED across every BV call site (wallet, prices, defi) by virtue of
// every caller importing `fetchBlockVisionWithRetry` from this module.
// This is the same semantics the legacy monolithic file had — a single
// per-process breaker isolates retry to burst conditions and trips
// during real outages regardless of which endpoint surfaces the 429.
// ---------------------------------------------------------------------------

import { getTelemetrySink } from '../telemetry.js';

export const BLOCKVISION_BASE = 'https://api.blockvision.org/v2/sui';

// ---------------------------------------------------------------------------
// BlockVision retry policy
//
// BlockVision Pro periodically returns 429 ("rate limited") under burst
// load — both the per-second key limit AND a global edge throttle that
// can fire even when the key is well under quota. Without retry, a
// single 429 cascades through the whole stack:
//   - balance_check's wallet read degrades to Sui-RPC ($0 for long-tail)
//   - DeFi read returns degraded → falls to sticky cache (or empty)
//   - portfolio_analysis trusts the partial+0 → no DeFi line
//
// Three attempts with jittered exponential backoff (250/750/2250ms ± 25%)
// catches the typical 1–3s BV throttle window before any user-visible
// degradation happens. If BlockVision sends a `Retry-After` header we
// honor it (capped at 5s to stay inside the per-call timeout budget).
//
// Worst case: 250 + 750 = ~1s of waiting before the third (final)
// attempt. Still well inside the 4s portfolio / 3s prices / 5s defi
// per-call timeouts because each `fetch()` carries its own
// `AbortSignal.timeout()` independent of the retry sleep.
// ---------------------------------------------------------------------------
const BV_RETRY_MAX_ATTEMPTS = 3;
const BV_RETRY_BASE_DELAY_MS = 250;
const BV_RETRY_BACKOFF_FACTOR = 3;
const BV_RETRY_JITTER = 0.25;
const BV_RETRY_AFTER_CAP_MS = 5_000;

// ---------------------------------------------------------------------------
// Circuit breaker — scaling guard
//
// Naive retry amplifies BV load 3x during sustained outages. At 10k
// users that's a self-inflicted DoS — every retry burst pushes BV
// further into rate-limit territory and prolongs the outage. Solution:
// a process-local circuit breaker. After CB_THRESHOLD 429s within a
// CB_WINDOW_MS rolling window, open the circuit for CB_COOLDOWN_MS
// and treat 429s as final (no retry). This isolates retry to the
// burst case it's designed for and removes amplification during real
// outages.
//
// Per-process state is intentional — global Redis-backed coordination
// would add latency on the hot path, and each Vercel function having
// its own breaker is acceptable: at 10k users we'd have ~10–50
// concurrent function instances; each one independently learning the
// circuit is open within ~5s of the outage starting is fast enough.
//
// Tunables chosen to detect a sustained outage in <5s without
// false-positiving on momentary bursts that retry would absorb.
// ---------------------------------------------------------------------------
const CB_WINDOW_MS = 5_000;
const CB_THRESHOLD = 10;
const CB_COOLDOWN_MS = 30_000;

let cb429Timestamps: number[] = [];
let cbOpenUntil = 0;

function cbIsOpen(now: number): boolean {
  return now < cbOpenUntil;
}

function cbRecord429(now: number): void {
  cb429Timestamps.push(now);
  cb429Timestamps = cb429Timestamps.filter((t) => now - t < CB_WINDOW_MS);
  if (cb429Timestamps.length >= CB_THRESHOLD && !cbIsOpen(now)) {
    cbOpenUntil = now + CB_COOLDOWN_MS;
    getTelemetrySink().gauge('bv.cb_open', 1);
    console.warn(
      `[blockvision] circuit breaker OPEN — ${CB_THRESHOLD} 429s in ${CB_WINDOW_MS}ms, retries disabled for ${CB_COOLDOWN_MS / 1000}s`,
    );
    cb429Timestamps = [];
  }
}

/** Test seam — reset breaker state between tests. */
export function _resetBlockVisionCircuitBreaker(): void {
  cb429Timestamps = [];
  cbOpenUntil = 0;
}

export interface BvRetryOpts {
  signal?: AbortSignal;
  /** Test seam — defaults to `Math.random()`. Inject a fixed RNG for deterministic tests. */
  rng?: () => number;
  /** Test seam — defaults to `setTimeout`-backed promise. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam — defaults to `Date.now()`. Inject for deterministic CB tests. */
  now?: () => number;
  /**
   * [SPEC 8 v0.5.1 B3.2] Mutable counter the engine attaches to
   * `ToolContext.retryStats`. Bumped to `attempt + 1` on every retry
   * iteration past the first, so a 1st-try success leaves the value
   * at 1 and a 2nd-try success leaves it at 2. The dispatcher reads
   * the final value back and surfaces it on the `tool_result` event
   * (only when > 1) so the host renders "TOOL · attempt N · 1.4s".
   */
  retryStats?: { attemptCount: number };
}

/**
 * [SPEC 19 Phase F / S.135 — 2026-05-09] Unified retry telemetry. Single
 * emission per terminal state across every retried external-call helper
 * (BV here, Anthropic in `providers/anthropic.ts`, Sui RPC in audric's
 * `lib/sui-retry.ts`). Engine-namespaced (no `audric.` prefix) because
 * this is a resilience-layer abstraction; vendor tag handles attribution.
 *
 * The metric describes the RETRY LAYER's behavior, not the call's success/
 * failure (errors are tracked separately via existing `bv.requests` per-status
 * counter).
 *
 * Outcomes (caller passes explicitly):
 *   - `first_try`       — no retry was burned. Either succeeded on attempt 0,
 *                         or returned a non-retriable response (4xx) on
 *                         attempt 0 — the layer correctly chose not to retry.
 *   - `retried_success` — the layer retried at least once and recovered.
 *   - `exhausted`       — the layer retried at least once and gave up
 *                         (max attempts hit, OR circuit breaker tripped on
 *                         a transient error path the layer wanted to retry).
 *
 * `attempts` tag is the 1-indexed total attempt count (first_try → '1',
 * second-try success → '2', exhausted-after-3 → '3', etc.).
 */
function emitTerminalRetry(
  vendor: 'bv',
  attemptZeroIndexed: number,
  outcome: 'first_try' | 'retried_success' | 'exhausted',
): void {
  getTelemetrySink().counter('external.retry_count', {
    vendor,
    outcome,
    attempts: String(attemptZeroIndexed + 1),
  });
}

/**
 * `fetch()` with bounded retry on transient failures.
 *
 * Retries on:
 *   - HTTP 429 (rate limited) — honors `Retry-After` if present
 *   - HTTP 5xx (transient server error)
 *   - Network errors (DNS, ECONNRESET, etc.) — but NOT AbortError
 *
 * Does NOT retry on:
 *   - HTTP 4xx other than 429 (client error — won't change on retry)
 *   - AbortError from the caller's signal (caller cancelled — respect)
 *
 * Returns the final `Response` (success or last non-retryable error)
 * so existing `res.ok` / `res.status` checks at call sites continue
 * to work unchanged. Re-throws the original error only when every
 * attempt was a network error (no Response object to return).
 */
export async function fetchBlockVisionWithRetry(
  url: string,
  init: RequestInit,
  opts: BvRetryOpts = {},
): Promise<Response> {
  const rng = opts.rng ?? Math.random;
  const sleep = opts.sleep ?? ((ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      // Wire the caller's signal into the sleep so cancelling the
      // overall request aborts the retry wait too — otherwise we'd
      // burn the full backoff before noticing the caller gave up.
      if (opts.signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }));

  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < BV_RETRY_MAX_ATTEMPTS; attempt++) {
    // [SPEC 8 v0.5.1 B3.2] Reflect the actual attempt count (1-indexed) into
    // the caller's mutable counter. Done at the top of every iteration so
    // even a network-error path (which `continue`s) still advances the
    // visible attempt count for the dispatcher's read-back.
    if (opts.retryStats) opts.retryStats.attemptCount = attempt + 1;
    if (attempt > 0) {
      // Base wait with exponential growth: 250, 750, 2250 ms.
      let waitMs = BV_RETRY_BASE_DELAY_MS * Math.pow(BV_RETRY_BACKOFF_FACTOR, attempt - 1);
      // Honor Retry-After when the server told us to wait — capped so
      // a misbehaving header (`Retry-After: 3600`) can't stall a
      // single tool call past its per-call timeout budget.
      const retryAfter = lastResponse?.headers.get('retry-after');
      if (retryAfter) {
        const secs = Number(retryAfter);
        if (Number.isFinite(secs) && secs > 0) {
          waitMs = Math.min(secs * 1000, BV_RETRY_AFTER_CAP_MS);
        }
      }
      // Symmetric jitter (±jitterFactor) to spread out caller bursts
      // — without it, every concurrent request retries at the same
      // moment and re-creates the burst we're trying to absorb.
      const jitterPx = (rng() * 2 - 1) * BV_RETRY_JITTER * waitMs;
      const delay = Math.max(0, waitMs + jitterPx);
      try {
        await sleep(delay);
      } catch (err) {
        // Caller aborted during backoff — bail with the last error/
        // response so the caller sees the same surface as if the
        // abort had fired during fetch itself.
        if (lastResponse) return lastResponse;
        throw err;
      }
    }

    try {
      lastResponse = await fetch(url, init);
    } catch (err) {
      lastError = err;
      // Don't retry if the caller cancelled — that's intentional.
      // Caller-cancel doesn't go through the unified retry counter (it's
      // not a vendor-side failure; emitting `exhausted` would falsely
      // inflate the alert metric).
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      getTelemetrySink().counter('bv.requests', { status: 'network_err', attempt: String(attempt) });
      continue;
    }

    if (lastResponse.ok) {
      getTelemetrySink().counter('bv.requests', { status: '2xx', attempt: String(attempt) });
      // Discriminator is whether retries were burned — attempt 0 = first_try,
      // attempt > 0 = retried_success. Symmetric across vendors.
      emitTerminalRetry('bv', attempt, attempt === 0 ? 'first_try' : 'retried_success');
      return lastResponse;
    }
    // 4xx other than 429 are permanent client errors — no point retrying.
    // The retry layer correctly chose not to retry; the response is the
    // response. Caller translates the 4xx into a user-facing error.
    if (lastResponse.status !== 429 && lastResponse.status < 500) {
      getTelemetrySink().counter('bv.requests', { status: String(lastResponse.status), attempt: String(attempt) });
      emitTerminalRetry('bv', attempt, attempt === 0 ? 'first_try' : 'retried_success');
      return lastResponse;
    }
    // Track 429s for the circuit breaker — if too many fire in a
    // short window we stop retrying and let the caller degrade
    // gracefully rather than amplifying load on an already-overloaded
    // upstream.
    if (lastResponse.status === 429) {
      getTelemetrySink().counter('bv.requests', { status: '429', attempt: String(attempt) });
      const now = (opts.now ?? Date.now)();
      cbRecord429(now);
      if (cbIsOpen(now)) {
        // Circuit-breaker-open early exit: we still surface the 429 to
        // the caller (degrades to fallback path). The layer wanted to
        // retry the 429 but the breaker said no — count as `exhausted`
        // (the layer's retry intent was abandoned).
        emitTerminalRetry('bv', attempt, 'exhausted');
        return lastResponse;
      }
    } else {
      getTelemetrySink().counter('bv.requests', { status: '5xx', attempt: String(attempt) });
    }
  }

  // Loop exhausted (every attempt was a 429 or 5xx that we kept retrying
  // until we hit BV_RETRY_MAX_ATTEMPTS). Final attempt is the cap minus 1
  // (0-indexed) — every retry was burned and we still failed.
  emitTerminalRetry('bv', BV_RETRY_MAX_ATTEMPTS - 1, 'exhausted');
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error('fetch failed after retries');
}

/**
 * Tiny shared helper for parsing BlockVision response fields that may
 * arrive as JSON strings, JSON numbers, or missing entirely. Used by
 * both the wallet response parser and the price-list response parser.
 * Returns `null` for any non-finite input so callers can null-coalesce
 * to a fallback (stable allow-list / cache hit / etc.).
 */
export function parseNumberOrNull(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string' || input.trim().length === 0) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}
