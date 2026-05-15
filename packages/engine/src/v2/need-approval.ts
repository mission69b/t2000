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
import type { ToolContext } from '../types.js';

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
    const ctx = options.experimental_context as ToolContext | undefined;

    // Defensive: if the context isn't threaded through (engine bug or
    // test stub), fail closed. Better to over-prompt than to skip
    // approval on a write.
    if (!ctx?.permissionConfig || !ctx?.priceCache) {
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
    // forces confirm regardless of amount per safeguards rule).
    const sendContext =
      toolName === 'send_transfer' && typeof inputObj.to === 'string'
        ? {
            to: inputObj.to,
            // Contacts live on EngineConfig but flow into
            // PermissionConfig calls via this hook. For Day 2 we pass
            // an empty array; Day 3 wires real contacts through.
            contacts: [] as ReadonlyArray<{ address: string }>,
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
