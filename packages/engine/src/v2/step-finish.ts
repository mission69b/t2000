// ---------------------------------------------------------------------------
// v2/step-finish.ts — onStepFinish handler for AI SDK streamText
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// Wires three engine concerns into AI SDK's `onStepFinish` callback:
//
//   1. Guard state update — for every tool result in the step, call
//      `updateGuardStateAfterToolResult` so trackers (balance freshness,
//      retry counts, swap quote pairing, lastHealthFactor) reflect what
//      just executed. Mirrors legacy engine.ts:1830.
//
//   2. `onAutoExecuted` callback — for every successful WRITE tool, fire
//      the host hook (audric uses this to bump TurnMetrics.sessionSpendUsd).
//      Mirrors legacy engine.ts:1947-1971. Wrapped in promise-catch so a
//      misbehaving host can't break the engine.
//
//   3. SessionSpend tracking — accumulate USD value of write tools so the
//      USD-aware permission resolver in `need-approval.ts` sees the
//      cumulative session spend on the next call. Today this is a
//      best-effort local accumulator; audric's source of truth remains
//      the host's TurnMetricsCollector (we just keep an in-memory mirror
//      so dispatched-but-not-yet-persisted writes get accounted for).
//
// [v2.0.2 / 2026-05-17] Adds wallet + DeFi cache invalidation as a
// fourth responsibility: every successful write tool kicks
// `clearPortfolioCacheFor(walletAddress)` + `clearDefiCacheFor(...)` so
// the next read tool (typically the LLM's verify-after-write
// `balance_check`) misses the 60s-TTL BlockVision cache and refetches
// fresh state. Without this, a withdraw-then-balance turn could read
// the pre-withdraw wallet snapshot from cache and tell the user they
// have no funds when they just received them. The invalidation runs
// fire-and-forget — engine never blocks waiting on it.
//
// What this module does NOT do (Day 3 deferrals):
//   - postWriteRefresh injection — interacts with `prepareStep` to
//     pre-canned read results for the NEXT step. Deferred to Day 3b
//     because the natural integration point is messages mutation
//     across the step boundary, which deserves its own focused PR.
//     The cache invalidation above is a strict subset of what full PWR
//     would do (PWR also pre-runs the read tools); since the LLM
//     already re-fires balance_check after most writes, plain
//     invalidation gets us 90% of the way.
//   - `flagSuspiciousResult` post-result scan — not part of the 14-guard
//     spec (private engine helper). Skipping for v2.
// ---------------------------------------------------------------------------

import type { ToolSet, StepResult, TypedToolResult, TypedToolError } from 'ai';
import {
  updateGuardStateAfterToolResult,
  extractTrustedAddressesFromResult,
  extractConversationText,
  type GuardToolView,
} from '../guards.js';
import { resolveUsdValue } from '../permission-rules.js';
import {
  clearPortfolioCacheFor,
  clearDefiCacheFor,
} from '../blockvision-prices.js';
import { getToolPolicy } from './tool-policy.js';
import { getToolFlags } from '../tool-flags.js';
import type { InternalContext } from './internal-context.js';

/**
 * Per-engine mutable bag updated by `step-finish.ts`. The engine reads
 * `sessionSpendUsd` back into `InternalContext.toolContext.sessionSpendUsd`
 * on the next turn so the USD-aware permission resolver sees the running
 * total without the host having to round-trip through TurnMetrics.
 *
 * Lifetime: same as the engine instance (per-session). Reset only when
 * a new engine is constructed. Audric's session-store rehydrate path
 * passes `sessionSpendUsd` in via `EngineConfig` on engine creation,
 * so the running total survives across page reloads / process restarts.
 */
export interface StepFinishMutableState {
  /**
   * Cumulative USD value of successful write tool calls across the
   * lifetime of this engine instance. Mirrors `EngineConfig.sessionSpendUsd`
   * but updated locally so the next call to `needsApproval` sees the
   * latest total without an extra host round-trip.
   */
  sessionSpendUsdLocal: number;
}

/**
 * Build the `onStepFinish` handler for `streamText`. The handler closes
 * over the engine's tools list, the InternalContext (which holds the
 * shared guard state ref), and the local sessionSpend accumulator.
 *
 * Returns a callback with the AI SDK signature: `(step) => void | Promise<void>`.
 */
export function buildStepFinishHandler(
  tools: ToolSet,
  internal: InternalContext,
  mutable: StepFinishMutableState,
): (step: StepResult<ToolSet>) => Promise<void> {
  return async (step: StepResult<ToolSet>): Promise<void> => {
    // AI SDK v6 `StepResult` exposes `toolResults` (successes) and `content`
    // (which carries `tool-error` parts among other content types).
    // Both `tool-result` and `tool-error` parts carry `input` directly
    // (no need to find the originating tool-call). We iterate both
    // collections so error paths get the same post-execution treatment
    // as success paths (legacy engine.ts:1830 does the same).

    type ToolOutcome = {
      toolName: string;
      input: unknown;
      result: unknown;
      isError: boolean;
    };

    const outcomes: ToolOutcome[] = [];

    // Successful tool calls — typed as TypedToolResult<ToolSet>.
    for (const tr of step.toolResults as ReadonlyArray<TypedToolResult<ToolSet>>) {
      outcomes.push({
        toolName: tr.toolName,
        input: tr.input,
        result: tr.output,
        isError: false,
      });
    }

    // Errored tool calls — extracted from step.content.
    for (const part of step.content) {
      if (part.type !== 'tool-error') continue;
      const te = part as TypedToolError<ToolSet>;
      outcomes.push({
        toolName: te.toolName,
        input: te.input,
        result: te.error,
        isError: true,
      });
    }

    for (const outcome of outcomes) {
      const { toolName, input, result, isError } = outcome;
      const toolExists = tools[toolName] !== undefined;
      const toolView: GuardToolView | undefined = toolExists
        ? { name: toolName, flags: getToolFlags(toolName) }
        : undefined;
      const isWriteTool =
        toolExists && getToolPolicy(toolName).permissionLevel !== 'auto';

      updateGuardStateAfterToolResult(
        toolName,
        toolView,
        input,
        result,
        isError,
        internal.guardState,
      );

      // 2. Trusted-address scan — for identity-resolving read tools
      // (`lookup_user`, `resolve_suins`), capture any 0x addresses they
      // returned and add to the per-session trusted set. This lets the
      // model pass the resolved address to `send_transfer` without the
      // user having to paste it themselves. Mirrors legacy S.121 behavior.
      // The legacy helper mutates `internal.guardState.trustedAddresses`
      // in place; needs `recentUserText` to scope the trust window.
      if (!isError) {
        const conv = extractConversationText(
          internal.getMessages() as Array<{ role: string; content: unknown }>,
        );
        extractTrustedAddressesFromResult(
          toolName,
          input,
          result,
          conv.recentUserText,
          internal.guardState,
        );
      }

      // 3. SessionSpend accumulation + onAutoExecuted — for successful
      // WRITE tools only. The two concerns are gated independently:
      //   - sessionSpend update fires whenever pricing is available
      //     (priceCache present). Tracks running total even when no
      //     onAutoExecuted hook is configured.
      //   - onAutoExecuted fires only when the host actually wired one.
      //   - Both gated on `permissionConfig` because resolveUsdValue
      //     uses the price cache, and a missing config signals the host
      //     doesn't care about USD-aware accounting.
      if (
        !isError &&
        isWriteTool &&
        internal.config.permissionConfig &&
        internal.config.priceCache
      ) {
        const usdValue = resolveUsdValue(
          toolName,
          (input ?? {}) as Record<string, unknown>,
          internal.config.priceCache,
        );

        // Mutate local session-spend mirror so the next needsApproval()
        // call in this turn sees the running total. Audric's
        // TurnMetricsCollector remains the source of truth across requests.
        mutable.sessionSpendUsdLocal += usdValue;
        internal.toolContext.sessionSpendUsd = mutable.sessionSpendUsdLocal;

        // Fire host hook in the background — failures must not block the
        // engine. Mirrors legacy engine.ts:1947-1971 try/catch pattern.
        if (internal.config.onAutoExecuted) {
          const hook = internal.config.onAutoExecuted;
          Promise.resolve()
            .then(() =>
              hook({
                toolName,
                usdValue,
                walletAddress: internal.walletAddress,
              }),
            )
            .catch((err) => {
              console.warn('[v2/step-finish] onAutoExecuted callback failed:', err);
            });
        }
      }

      // 4. Wallet + DeFi cache invalidation — every successful write
      //    changes on-chain state. The next balance_check /
      //    portfolio_analysis call MUST miss the BV cache and fetch
      //    fresh data. Cheap to call unconditionally (no-op when no
      //    cached entry exists for the address).
      //
      //    Gated independently from sessionSpend / onAutoExecuted (no
      //    permissionConfig / priceCache requirement) because cache
      //    correctness has nothing to do with USD pricing.
      //
      //    NAVI cache is NOT invalidated here — it has a 30s TTL
      //    (vs BV's 60s) and is keyed by tool+address rather than
      //    address-only, so its staleness window is narrower and the
      //    invalidation surface is more complex. Tracked for v2.0.3
      //    if savings_info post-write staleness shows up in soak.
      if (!isError && isWriteTool && internal.walletAddress) {
        const address = internal.walletAddress;
        Promise.resolve()
          .then(() =>
            Promise.all([
              clearPortfolioCacheFor(address),
              clearDefiCacheFor(address),
            ]),
          )
          .catch((err) => {
            console.warn(
              '[v2/step-finish] post-write cache invalidation failed:',
              err,
            );
          });
      }
    }
  };
}
