// [SPEC 21.1] Stream-state choreography wrapper.
//
// Wraps an EngineEvent stream and emits typed `stream_state` events at
// well-known tool boundaries. The wrapper is a pure transformation of
// an event stream — it does NOT touch engine.ts internals, which keeps
// the coupling to specific tool names (today: only `swap_quote`) at the
// edge instead of the core dispatcher.
//
// Default-applied inside `engineToSSE` so every host that uses the SSE
// adapter gets stream_state events automatically. Hosts that consume
// `EngineEvent` directly (e.g. unit tests, in-process embeddings) opt in
// by wrapping their own AsyncGenerator with `withStreamState()`.
//
// Per SPEC 21 D-3 lock (= staged rollout), engine ALWAYS emits these
// events; audric (and other hosts) gate the visual choreography on a
// feature flag (`NEXT_PUBLIC_HARNESS_TRANSITIONS_V1`). Older hosts that
// don't subscribe ignore unknown event types — backward-compatible.

import type { EngineEvent } from './types.js';

/**
 * The 5 valid stream-state transitions per D-1 (a) lock — typed enum,
 * no `copyHint`. Hosts map each state to their own copy + motion + icon.
 *
 * Engine-emitted: `routing` (before swap_quote tool start), `quoting`
 * (after swap_quote tool result success).
 *
 * Host-emitted (audric layers in from sponsored-tx flow): `confirming`,
 * `settling`, `done`. Engine NEVER emits these — they fire AFTER the
 * `pending_action` handoff which the engine doesn't see until resume.
 */
export type StreamState = 'routing' | 'quoting' | 'confirming' | 'settling' | 'done';

/**
 * The shape of the `stream_state` event itself — re-exported for
 * convenience so hosts can type their event handlers without importing
 * the full `EngineEvent` union.
 */
export interface StreamStateEvent {
  type: 'stream_state';
  state: StreamState;
}

/**
 * Wraps an EngineEvent AsyncGenerator and inlines `stream_state` events
 * at swap-quote boundaries. Per-turn state — resets on `turn_complete`
 * so a multi-turn session can fire `routing → quoting` again on each
 * subsequent swap turn.
 *
 * Emission rules:
 *  - `routing` fires immediately BEFORE the first `tool_start` for
 *    `swap_quote` in a turn. Once-per-turn (idempotent on subsequent
 *    same-turn `tool_start` events for the same tool — those are
 *    typically dedup-cache hits with no preceding tool_start anyway).
 *  - `quoting` fires immediately AFTER the first SUCCESSFUL `tool_result`
 *    for `swap_quote` in a turn. Once-per-turn. Skipped when
 *    `isError: true` (failed routing → no "Quote in hand" flash).
 *
 * Edge cases handled by the design:
 *  - `microcompact`-injected dedup events use `toolName: '__deduped__'`
 *    (engine.ts line 1293) so they don't trigger `quoting`.
 *  - Post-write refresh tool_results (`wasPostWriteRefresh: true`) are
 *    `balance_check` / `savings_info` etc. — toolName ≠ `swap_quote`.
 *  - Turn-read cache hits emit `tool_result` without `tool_start`. If a
 *    same-turn cached `swap_quote` hits, `quoting` fires without
 *    `routing` — semantically correct (the UI is about to show a quote
 *    card, the routing transition just happened to be instant).
 */
export async function* withStreamState<T extends EngineEvent>(
  events: AsyncGenerator<T>,
): AsyncGenerator<T | StreamStateEvent> {
  let routedThisTurn = false;
  let quotedThisTurn = false;

  for await (const event of events) {
    if (
      event.type === 'tool_start' &&
      event.toolName === 'swap_quote' &&
      !routedThisTurn
    ) {
      routedThisTurn = true;
      yield { type: 'stream_state', state: 'routing' };
    }

    yield event;

    if (
      event.type === 'tool_result' &&
      event.toolName === 'swap_quote' &&
      !event.isError &&
      !quotedThisTurn
    ) {
      quotedThisTurn = true;
      yield { type: 'stream_state', state: 'quoting' };
    }

    if (event.type === 'turn_complete') {
      routedThisTurn = false;
      quotedThisTurn = false;
    }
  }
}
