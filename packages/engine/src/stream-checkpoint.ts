// ---------------------------------------------------------------------------
// stream-checkpoint.ts — page-reload stream resume infrastructure
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 5 Slice C deliverable (2026-05-17, engine v2.2.0).
// Spec: /Users/funkii/.cursor/plans/v07a-phase-5-slice-c-spec.md
//
// What this module ships
// ----------------------
// • `StreamCheckpointStore` — pluggable per-stream event log interface.
//   Engine appends every yielded `EngineEvent` (fire-and-forget per
//   Decision 5); on a subsequent `submitMessage({ resumeStreamId })`,
//   engine REPLAYS THE CHECKPOINTED SEQUENCE AND RETURNS — no second
//   LLM pass, no live continuation (per S.151: "no duplicate
//   `tool_start`, no redundant LLM run"). When the replay log lacks
//   a terminal event (`turn_complete` or `pending_action`), the engine
//   synthesises a `turn_complete` so the host state machine doesn't
//   hang waiting for one. Empty checkpoint → engine emits a clear
//   `EngineEvent.error` ("no checkpoint for streamId …"); host should
//   start a fresh send.
//
//   Resume scope = page-reload / Vercel cold-start / mobile-tab
//   swap mid-turn; NOT the user-confirm-then-resume flow (that stays
//   on the existing pending_action / resumeWithToolResult path).
//
// • `InMemoryStreamCheckpointStore` — default impl backed by a
//   `Map<streamId, EngineEvent[]>` with a per-stream TTL `setTimeout`
//   (default 5 min per Decision 7). Used by the CLI / MCP / tests /
//   single-instance dev; hosts (audric) inject an Upstash-backed impl
//   at engine init when they ship the page-reload UX.
//
// • `detectInFlightTool` — Path B helper (per Decision 6). Walks a
//   checkpointed event sequence and returns the dangling `tool_start`
//   if no matching `tool_result` followed it. Engine uses this on
//   resume to decide whether to error out with "cannot resume mid-tool;
//   please retry" instead of continuing the live stream (Path A —
//   silent tool re-execution — is deferred to v2.3.0+).
//
// Design decisions locked at spec sign-off
// ----------------------------------------
// 1. `append` returns `Promise<number>` (assigned sequence number,
//    1-indexed, monotonic per streamId).
// 2. `has(streamId)` is OPTIONAL on the interface. The in-memory impl
//    provides it trivially; Upstash impls skip it (defaulting through
//    the empty-replay path).
// 3. TTL is STORE-DRIVEN. Engine never inspects "is this stream
//    expired?" — it only calls `clear()` on natural turn end. Stores
//    enforce their own TTL.
// 4. streamId is ENGINE-GENERATED (`crypto.randomUUID()`) per
//    `submitMessage()` when a store is configured. Engine emits a new
//    `stream_started` EngineEvent first so the host can persist the
//    id and replay it back on reconnect.
// 5. Writes are FIRE-AND-FORGET. The live stream never stalls on
//    store I/O; transient store failures degrade to "this turn is
//    not resumable" with a logged warning, but the live wire keeps
//    flowing.
// 6. In-flight tool resume = PATH B: engine emits `{type: 'error',
//    error}` and stops. Host re-prompts. Path A (silent re-execution)
//    is a v2.3.0+ enhancement once production tells us how often the
//    mid-tool resume case actually fires.
// 7. Default in-memory TTL = 5 minutes (covers Vercel cold-start
//    window + mobile-tab background + most page-reload cases).
// ---------------------------------------------------------------------------

import type { EngineEvent } from './types.js';

// ---------------------------------------------------------------------------
// StreamCheckpointStore interface
// ---------------------------------------------------------------------------

/**
 * Pluggable per-stream EngineEvent checkpoint log.
 *
 * Lifecycle: one `streamId` per `submitMessage()` call. Engine appends
 * every yielded `EngineEvent` to the store as it emits; on a subsequent
 * `submitMessage({ resumeStreamId })`, engine REPLAYS THE CHECKPOINTED
 * EVENTS AND RETURNS — replay-only, no second LLM pass, no live
 * continuation (per S.151). Engine synthesises a terminal `turn_complete`
 * if the replay log lacks one (e.g. the original stream was killed
 * mid-event). Empty replay → `EngineEvent.error` on the wire.
 *
 * Idempotency: `append` is called once per event by the engine; duplicate
 * appends (same streamId + same sequence number) are caller-side bugs.
 *
 * Failure handling:
 * - `append` SHOULD swallow transient write failures (fire-and-forget
 *   per Decision 5); the engine logs + degrades to "not resumable" on
 *   any thrown error.
 * - `replay` MUST surface read failures by throwing (the engine treats
 *   a failed replay as a hard error and emits an `EngineEvent.error`).
 *
 * Cleanup: `clear(streamId)` is called by the engine when a turn ends
 * naturally (`turn_complete`). Hosts that prefer external TTL (Upstash
 * native expiry) can no-op `clear` and rely on their backend.
 */
export interface StreamCheckpointStore {
  /**
   * Append one `EngineEvent` to the checkpoint log for `streamId`.
   * Returns the assigned sequence number (1-indexed, monotonic per
   * streamId).
   *
   * MUST be safe to call concurrently across DIFFERENT streamIds.
   * Same-streamId concurrent appends are prevented by construction
   * (one stream per `submitMessage()` invocation).
   */
  append(streamId: string, event: EngineEvent): Promise<number>;

  /**
   * Replay the checkpointed events for `streamId` in append order.
   * Returns an empty generator when no checkpoint exists (e.g.
   * `resumeStreamId` was passed but the checkpoint was never written
   * or has been cleaned up).
   *
   * On infra failure: throw. The engine propagates as an
   * `EngineEvent.error` and stream closes; client retries.
   *
   * [v2.5.0 5e-4] Optional `opts.signal` lets the caller cancel an
   * in-flight replay (e.g. host knows the SSE consumer is gone, or
   * a fresh `submitMessage` is starting and the previous replay's
   * remaining work can be discarded). Impls SHOULD check
   * `opts?.signal?.aborted` between yields and exit early when set;
   * the engine treats an aborted replay as a clean termination (no
   * `EngineEvent.error` is emitted because the host requested it).
   *
   * The parameter is OPTIONAL on the interface — existing impls
   * (v2.2.0 / v2.3.0 / v2.4.0 era) that ignore it continue to work,
   * they just don't gain the early-exit benefit.
   */
  replay(
    streamId: string,
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<EngineEvent>;

  /**
   * Drop the checkpoint log for `streamId`. Idempotent — clearing
   * a non-existent streamId is a no-op.
   */
  clear(streamId: string): Promise<void>;

  /**
   * OPTIONAL existence check used by the engine to short-circuit the
   * replay path. When omitted, the engine always calls `replay` and
   * checks for empty (correct but less efficient).
   *
   * Hosts with cheap existence semantics (Redis EXISTS) should
   * implement; the in-memory default does too.
   */
  has?(streamId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// InMemoryStreamCheckpointStore — default impl
// ---------------------------------------------------------------------------

/**
 * Process-local checkpoint store backed by a `Map<string, EngineEvent[]>`
 * with per-stream TTL via `setTimeout`. Default for CLI / MCP / tests /
 * single-instance dev servers.
 *
 * NOT suitable for multi-instance deployments — each Vercel function
 * has its own Map, so a stream started on instance A cannot be resumed
 * on instance B. Audric (when it ships the page-reload UX) injects an
 * Upstash-backed impl at engine init.
 */
export class InMemoryStreamCheckpointStore implements StreamCheckpointStore {
  private readonly streams = new Map<string, EngineEvent[]>();
  private readonly ttlTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ttlMs: number;

  /**
   * @param opts.ttlMs — eviction window per stream (default 5 minutes).
   *   Each `append` resets the TTL for that stream; `clear` cancels it.
   */
  constructor(opts?: { ttlMs?: number }) {
    this.ttlMs = opts?.ttlMs ?? 5 * 60 * 1000;
  }

  async append(streamId: string, event: EngineEvent): Promise<number> {
    let log = this.streams.get(streamId);
    if (!log) {
      log = [];
      this.streams.set(streamId, log);
    }
    log.push(event);
    this.resetTtl(streamId);
    return log.length;
  }

  async *replay(
    streamId: string,
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<EngineEvent> {
    const log = this.streams.get(streamId);
    if (!log) return;
    for (const ev of log) {
      // [v2.5.0 5e-4] Honor caller's abort signal between yields so
      // a host that no longer cares about the rest of the replay can
      // tell us to stop. Cheap (one boolean check per event) and the
      // right end-state even when nothing currently consumes it.
      if (opts?.signal?.aborted) return;
      yield ev;
    }
  }

  async clear(streamId: string): Promise<void> {
    this.streams.delete(streamId);
    const t = this.ttlTimers.get(streamId);
    if (t) {
      clearTimeout(t);
      this.ttlTimers.delete(streamId);
    }
  }

  async has(streamId: string): Promise<boolean> {
    return this.streams.has(streamId);
  }

  /** Test helper — current stream count. */
  get size(): number {
    return this.streams.size;
  }

  private resetTtl(streamId: string): void {
    const existing = this.ttlTimers.get(streamId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void this.clear(streamId);
    }, this.ttlMs);
    // Node-only: don't keep the process alive just for the eviction.
    // No-op in environments (workers, edge) that don't ship `.unref`.
    if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
    this.ttlTimers.set(streamId, timer);
  }
}

// ---------------------------------------------------------------------------
// detectInFlightTool — Path B helper (per Decision 6)
// ---------------------------------------------------------------------------

export interface InFlightToolDetection {
  /** The dangling `tool_start` event (LAST tool_start that lacks a matching tool_result). */
  toolUseId: string;
  toolName: string;
}

/**
 * Scan a checkpointed event sequence for a dangling `tool_start` (one
 * whose `tool_result` never arrived). Returns the dangling tool info,
 * or `null` if every `tool_start` had a matching `tool_result`.
 *
 * Used by the engine on resume: if a stream was killed AFTER a tool
 * was dispatched but BEFORE its result returned, replaying through the
 * live LLM is unsafe (the LLM has no signal that the tool ran or didn't;
 * the underlying side-effect — sponsored tx, MCP read — may or may not
 * have completed). Path B handles this by emitting an error and forcing
 * the host to re-prompt the user fresh.
 *
 * Implementation note: matching is by `toolUseId`. The engine emits one
 * `tool_start` then exactly one `tool_result` (success OR error) per
 * tool dispatch. A `pending_action` event is NOT considered "in-flight"
 * — it intentionally pauses the stream and the user-confirm flow takes
 * over from there (see `resumeWithToolResult`, not `submitMessage`).
 */
// ---------------------------------------------------------------------------
// StreamResumeOutcome — `onStreamResume` telemetry callback payload
// ---------------------------------------------------------------------------

/**
 * [v2.5.0 5e-3] Outcome of a resume call (`submitMessage({ resumeStreamId })`).
 * Passed to `EngineConfig.onStreamResume` exactly ONCE per resume call,
 * right before the engine returns from the resume branch.
 *
 * Five mutually-exclusive outcomes:
 *
 * - `clean` — replay log contained a natural terminal (`turn_complete`
 *   or `pending_action`); engine yielded the events verbatim.
 * - `synthesized_terminal` — replay log lacked a terminal (original
 *   stream was killed mid-event); engine yielded the events PLUS a
 *   synthetic `turn_complete` so the host state machine doesn't hang.
 * - `mid_tool` — replay log contained a `tool_start` without matching
 *   `tool_result` (Path B). Engine yielded an `EngineEvent.error`
 *   ("cannot resume mid-tool"); host re-prompts.
 * - `empty` — checkpoint store had nothing for `resumeStreamId`
 *   (expired, never written, wrong id). Engine yielded an
 *   `EngineEvent.error` ("no checkpoint"); host starts a fresh send.
 * - `replay_error` — `store.replay()` itself threw. Engine yielded
 *   an `EngineEvent.error` carrying the underlying error.
 *
 * `eventsReplayed` counts events emitted from the checkpoint (NOT
 * the synthetic terminal in the `synthesized_terminal` case, NOT
 * any error events emitted alongside).
 *
 * The `mid_tool` variant carries `toolUseId` + `toolName` so telemetry
 * can correlate Path B fires with specific tools (e.g. "swap_execute
 * accounts for 80% of mid-tool resumes → Path A would help here").
 */
export type StreamResumeOutcome =
  | { outcome: 'clean'; streamId: string; eventsReplayed: number }
  | {
      outcome: 'synthesized_terminal';
      streamId: string;
      eventsReplayed: number;
    }
  | {
      outcome: 'mid_tool';
      streamId: string;
      eventsReplayed: number;
      toolUseId: string;
      toolName: string;
    }
  | { outcome: 'empty'; streamId: string }
  | { outcome: 'replay_error'; streamId: string; error: Error };

export function detectInFlightTool(
  events: EngineEvent[],
): InFlightToolDetection | null {
  const seenResults = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'tool_result') {
      seenResults.add(ev.toolUseId);
    }
  }

  // Scan in reverse so we return the LAST dangling tool_start (the
  // most recent one — debug logs cite the active head-of-line tool).
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'tool_start' && !seenResults.has(ev.toolUseId)) {
      return { toolUseId: ev.toolUseId, toolName: ev.toolName };
    }
  }
  return null;
}
