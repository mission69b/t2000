// ---------------------------------------------------------------------------
// v2/need-approval.ts — USD-aware needsApproval wrapper for AI SDK tools
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 2 (2026-05-15).
//
// Wraps the legacy `resolvePermissionTier` USD-aware permission resolver
// as an AI SDK `ToolNeedsApprovalFunction`. When the engine wires this
// into a tool's `needsApproval`, AI SDK pauses the stream after the
// model emits the tool_use, surfacing a `ToolApprovalRequest` event —
// the exact replacement for the legacy engine's `pending_action`
// mechanism.
//
// Per SPIKE_FINDINGS_v07a.md concerns mapping:
//   - `pending_action` engine event → AI SDK `tool-approval-request`
//   - `attemptId` (UUID v4) → AI SDK `toolCallId` (already UUID v4)
//   - `permissionLevel: 'confirm'` static → dynamic per-call USD resolver
//   - `autonomousDailyLimit` runtime safety net → still enforced via
//      sessionSpendUsd thread-through to `resolvePermissionTier`
//
// Per safeguards-defense-in-depth.mdc the resolver MUST fail closed:
// when in doubt, return `true` (require approval). Caller misconfig
// shows up as "everything taps to approve" — annoying but safe.
// ---------------------------------------------------------------------------

import {
  resolvePermissionTier,
  resolveUsdValue,
  toolNameToOperation,
} from '../permission-rules.js';
import { getToolPolicy } from './tool-policy.js';
import { tryGetInternalContext } from './internal-context.js';

// AI SDK v6 doesn't re-export ToolNeedsApprovalFunction from the `ai`
// package barrel (it lives in @ai-sdk/provider-utils which is a
// transitive dep of `ai`). Inline the signature here so we don't add
// a direct dep on provider-utils — the contract is well-defined and
// stable across AI SDK v6.x patch releases.
type NeedsApprovalFn = (
  input: unknown,
  options: {
    toolCallId: string;
    messages: unknown[];
    experimental_context?: unknown;
  },
) => boolean | PromiseLike<boolean>;

/**
 * Build the `needsApproval` callback for an AI SDK `tool()` definition.
 *
 * Returns a function that decides per-call whether the model can
 * dispatch the tool autonomously or whether the user must tap to
 * approve. The resolver runs the existing USD-aware permission logic —
 * no behavior change vs the legacy engine.
 *
 * Read tools (and tools with TOOL_POLICY.permissionLevel === 'auto')
 * don't need this wrapper at all; AI SDK's `needsApproval` defaults to
 * `false` when omitted.
 *
 * @param toolName - The tool name as registered in TOOL_POLICY (used
 *   for the USD-resolver's per-operation rule lookup).
 * @returns A `ToolNeedsApprovalFunction` ready to drop into
 *   `tool({ needsApproval: ..., ... })`.
 */
export function buildNeedsApproval(toolName: string): NeedsApprovalFn {
  const policy = getToolPolicy(toolName);

  // Static `'auto'` policy → never needs approval (e.g., read tools).
  // Static `'explicit'` policy → ALWAYS needs approval (LLM cannot
  // auto-dispatch — the user must initiate from a UI surface).
  if (policy.permissionLevel === 'auto') {
    return () => false;
  }
  if (policy.permissionLevel === 'explicit') {
    return () => true;
  }

  // 'confirm' policy → defer to the USD-aware resolver per call.
  return (input, options) => {
    const internal = tryGetInternalContext(options.experimental_context);

    // Defensive: if the context isn't threaded through (engine bug or
    // test stub), fail closed. Better to over-prompt than to skip
    // approval on a write.
    if (!internal) return true;

    const ctx = internal.toolContext;

    // [SPEC 37 v0.7a Phase 2 Day 13.2 / 2026-05-16] CRITICAL — mirror
    // the legacy QueryEngine `engine.ts:1657` safeguard: when no
    // `agent` is in the ToolContext (audric's client-signed sponsored-
    // tx flow), write tools CANNOT execute server-side. Forcing
    // approval here makes AI SDK pause on `tool-approval-request` →
    // engine emits `pending_action` → audric's chat route hands the
    // tool input to the client which signs the sponsored tx and POSTs
    // the result back via `/api/engine/resume`.
    //
    // Without this guard the USD-aware resolver below would route a
    // sub-threshold write (e.g. 0.05 USDC save → 'auto' tier per
    // DEFAULT_PERMISSION_CONFIG.save.autoBelow=50) to inline execute,
    // which trips `requireAgent()` inside the legacy tool factory and
    // throws "agent configuration issue". Caught in production by the
    // Day 13 founder smoke; legacy QueryEngine has had this exact line
    // since v0.46.x. Rule belongs in BOTH engines for the migration
    // window.
    //
    // The check is a no-op when `ctx.agent` is set (e.g., t2000 CLI
    // engine usage where the engine itself signs — the USD resolver
    // below decides per-call as designed). We only reach this branch
    // for confirm-tier tools (auto/explicit short-circuited above), so
    // `isReadOnly` is implicitly false — any tool needing approval at
    // all is by definition a write.
    if (!ctx.agent) {
      return true;
    }

    if (!ctx.permissionConfig || !ctx.priceCache) {
      return true;
    }

    const operation = toolNameToOperation(toolName);
    if (!operation) {
      // Unknown tool → fail closed.
      return true;
    }

    const inputObj = (input ?? {}) as Record<string, unknown>;
    const amountUsd = resolveUsdValue(toolName, inputObj, ctx.priceCache);

    // Build optional sendContext for `send_transfer` (contact lookup
    // forces confirm regardless of amount per safeguards rule). Day 3:
    // real contacts threaded via InternalContext (was empty in Day 2).
    const sendContext =
      toolName === 'send_transfer' && typeof inputObj.to === 'string'
        ? {
            to: inputObj.to,
            contacts: internal.contacts,
          }
        : undefined;

    const tier = resolvePermissionTier(
      operation,
      amountUsd,
      ctx.permissionConfig,
      ctx.sessionSpendUsd,
      sendContext,
    );

    // 'auto' → don't need approval. Anything else → need it.
    return tier !== 'auto';
  };
}
