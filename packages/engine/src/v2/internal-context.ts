// ---------------------------------------------------------------------------
// v2/internal-context.ts — wraps ToolContext with engine-internal state
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// `InternalContext` is what AISDKEngine threads through `experimental_context`.
// It carries:
//   - `toolContext` — the EXTERNAL contract that legacy tools see in
//     `legacy.call(input, ctx)`. Identical to the existing `ToolContext`.
//   - Engine-internal state — guard runner state, guard config, contacts,
//     wallet address, refs to engine-level callbacks. NOT exposed to tools.
//
// The split exists because:
//   1. Tools should NOT see engine internals (mutating `guardState` from
//      a tool body would corrupt the engine; tools don't need contacts
//      or guard config to do their job).
//   2. The wrapper, the needsApproval callback, and the onStepFinish
//      handler all need access to the SAME mutable per-turn state
//      (guardState in particular). Threading them via experimental_context
//      gives all three sites one canonical reference.
//
// Day 3 callers of `InternalContext`:
//   - `tool-wrapper.ts` execute() — runs guards before legacy.call,
//     extracts `.toolContext` for the legacy call.
//   - `need-approval.ts` — extracts `.toolContext` for the USD resolver,
//     reads `.contacts` for send-safety check.
//   - `step-finish.ts` — uses `.guardState` to call updateGuardStateAfterToolResult,
//     reads `.config` to fire onAutoExecuted.
// ---------------------------------------------------------------------------

import type { ToolContext, EngineConfig } from '../types.js';
import type { GuardRunnerState, GuardConfig } from '../guards.js';

/**
 * Shape of `experimental_context` threaded through every AI SDK
 * `tool.execute()`, `needsApproval()`, and step-lifecycle callback.
 *
 * Public field (`toolContext`) is what legacy tools see. Everything
 * else is engine-internal — accessed only by the v2/ wrapper layer.
 */
export interface InternalContext {
  /**
   * The legacy `ToolContext` shape — wallet address, RPC URL, price
   * cache, permission config, etc. Tools see ONLY this when they call
   * `(experimental_context as InternalContext).toolContext` (the
   * wrapper does the cast on their behalf).
   */
  toolContext: ToolContext;

  /**
   * Per-turn guard runner state — balance/retry/swap-quote trackers,
   * lastHealthFactor cache, trusted-addresses set. Created at engine
   * construction (per-session lifetime), mutated across turns.
   *
   * Day 3 design choice: state lives on the engine, NOT in InternalContext
   * directly — but a REFERENCE to it is threaded through so the
   * wrapper + onStepFinish can read/write the same mutable object.
   */
  guardState: GuardRunnerState;

  /**
   * Guard tier configuration (which guards run, with what thresholds).
   * Same shape as legacy `EngineConfig.guards`. When undefined, the
   * wrapper skips the guard pipeline entirely (matches legacy behavior).
   */
  guardConfig: GuardConfig | undefined;

  /**
   * User-saved contacts. Threaded through to the guard pipeline (for
   * `guardAddressSource`) and to needsApproval (for `send_transfer`
   * contact-match → confirm tier override).
   */
  contacts: ReadonlyArray<{ name: string; address: string }>;

  /**
   * User's own wallet address — used by guards as a trusted source for
   * `guardAddressSource` (sending to oneself never requires a contact).
   */
  walletAddress: string | undefined;

  /**
   * Reference to the engine config. `step-finish.ts` reads
   * `onAutoExecuted` from here to fire the post-write callback. Kept as
   * an opaque reference so the engine can mutate config-shaped state
   * (e.g., bump sessionSpendUsd) without re-threading.
   */
  config: ConfigSubsetForStepFinish;

  /**
   * Reference to the conversation messages array. `guardConversationContext`
   * reads from this to compute `extractConversationText()` for the
   * trusted-address scan. Kept as a getter (not a snapshot) so each
   * tool dispatch sees the latest history.
   */
  getMessages: () => ReadonlyArray<{ role: string; content: unknown }>;
}

/**
 * The subset of engine config that step-finish needs. Narrowed from
 * the full `EngineConfig` so the dependency surface is explicit and
 * tests can construct one without mocking the entire config.
 */
export interface ConfigSubsetForStepFinish {
  onAutoExecuted: EngineConfig['onAutoExecuted'];
  onGuardFired: EngineConfig['onGuardFired'];
  postWriteRefresh: EngineConfig['postWriteRefresh'];
  permissionConfig: EngineConfig['permissionConfig'];
  priceCache: EngineConfig['priceCache'];
}

/**
 * Type guard: extract InternalContext from `experimental_context`,
 * with a useful error if the engine forgot to thread it.
 */
export function asInternalContext(value: unknown): InternalContext {
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      '[v2] experimental_context is not an InternalContext — engine wiring bug',
    );
  }
  const v = value as Record<string, unknown>;
  if (!('toolContext' in v) || !('guardState' in v)) {
    throw new Error(
      '[v2] experimental_context is missing toolContext/guardState — engine wiring bug',
    );
  }
  return value as InternalContext;
}

/**
 * Soft variant of `asInternalContext` — returns undefined if the shape
 * doesn't match instead of throwing. Used by `needsApproval` which
 * fails closed (returns true) when context isn't threaded properly.
 */
export function tryGetInternalContext(value: unknown): InternalContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (!('toolContext' in v) || !('guardState' in v)) return undefined;
  return value as InternalContext;
}
