// ---------------------------------------------------------------------------
// v2/guard-runner.ts — runs the legacy 14-guard pipeline from inside execute()
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// Why guards run inside execute() (not in `prepareStep`):
//
// AI SDK's `prepareStep` runs BEFORE the model call — too early to know
// which tools the model will choose. The 14 guards are PER-TOOL-CALL
// gates (HF check before borrow, balance check before write, recipient
// validation before send, etc.) — they need the dispatched tool name +
// input + ctx in hand. The natural home is inside the wrapped tool's
// `execute()`, between preflight and the legacy `call`.
//
// Architecturally identical to the legacy engine's `runGuards` call site
// in `engine.ts:1708`, just collapsed into the per-tool wrapper. Same
// blocking semantics: a `block` verdict causes execute() to throw, which
// AI SDK surfaces as a tool error to the model.
//
// What this module does NOT do:
//   - It does NOT update guard state after the call. That's
//     `step-finish.ts`'s job — see `updateGuardStateAfterToolResult`.
// ---------------------------------------------------------------------------

import {
  runGuards,
  type GuardCheckResult,
  type GuardInjection,
  type GuardToolView,
} from '../guards.js';
import { extractConversationText } from '../guards.js';
import type { PendingToolCall } from '../types.js';
import type { InternalContext } from './internal-context.js';

/**
 * Result returned by `runGuardsForTool` to the wrapper. Designed to be
 * cheap to ignore when no guards are configured (`config === undefined`
 * → returns `{ allowed: true, injections: [] }` with no work).
 */
export interface GuardRunnerOutcome {
  /**
   * `false` ONLY when a guard returned `block`. The wrapper throws a
   * tool error in that case so AI SDK feeds the rejection back to the
   * model — same loop semantics as the legacy engine.
   */
  allowed: boolean;
  /**
   * Block reason (human-readable) — surfaced in the thrown error so the
   * LLM sees WHY the call was rejected and can self-correct or narrate
   * the failure to the user.
   */
  blockReason?: string;
  /**
   * Block gate identifier (e.g. `'health_factor'`, `'balance_validation'`).
   * Threaded into the thrown error envelope so audric's BlockRouter can
   * render a guard-specific UI (vs a generic tool error).
   */
  blockGate?: string;
  /**
   * Soft warnings/hints to inject alongside the tool result. Currently
   * unused by the v2 wrapper (Day 4+ tool migration may surface them
   * via AI SDK content blocks); collected here so the data is available.
   */
  injections: GuardInjection[];
}

/**
 * Run the 14-guard pipeline for one tool call. Wraps legacy `runGuards`
 * with v2 ergonomics (returns `GuardRunnerOutcome` instead of the
 * lower-level `GuardCheckResult`).
 *
 * When `internal.guardConfig` is `undefined`, no guards run and the
 * call is allowed unconditionally — matches legacy behavior when
 * `EngineConfig.guards` is omitted.
 */
export function runGuardsForTool(
  tool: GuardToolView,
  call: PendingToolCall,
  internal: InternalContext,
): GuardRunnerOutcome {
  if (!internal.guardConfig) {
    return { allowed: true, injections: [] };
  }

  const conversationContext = extractConversationText(internal.getMessages() as Array<{ role: string; content: unknown }>);

  const result: GuardCheckResult = runGuards(
    tool,
    call,
    internal.guardState,
    internal.guardConfig,
    conversationContext,
    internal.config.onGuardFired,
    {
      contacts: internal.contacts,
      walletAddress: internal.walletAddress,
    },
  );

  if (result.blocked) {
    return {
      allowed: false,
      blockReason: result.blockReason,
      blockGate: result.blockGate,
      injections: result.injections,
    };
  }

  return {
    allowed: true,
    injections: result.injections,
  };
}

/**
 * Error thrown by the wrapper when a guard blocks. Carries the gate id
 * so audric's BlockRouter can pattern-match for guard-specific UX
 * (e.g., "Health Factor too low" gets a different card than a
 * generic tool error).
 */
export class GuardBlockedError extends Error {
  readonly gate: string;
  constructor(gate: string, reason: string) {
    super(reason);
    this.name = 'GuardBlockedError';
    this.gate = gate;
  }
}
