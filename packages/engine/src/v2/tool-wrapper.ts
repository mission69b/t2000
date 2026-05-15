// ---------------------------------------------------------------------------
// v2/tool-wrapper.ts — bridge legacy Tool[] → AI SDK ToolSet
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 2 (2026-05-15).
//
// `toAISDKTools(legacyTools)` lets unmigrated tools work through the
// AISDKEngine during the 3-week migration window. Without this, every
// tool would have to be rewritten to AI SDK `tool()` natively before
// the new engine could dispatch any of them — that blocks Day 4+
// per-tool migration on a single big-bang rewrite.
//
// The wrapper is intentionally MINIMAL — it does NOT add any new
// behavior, just surfaces the legacy tool's existing semantics through
// the AI SDK shape:
//   - description / inputSchema → AI SDK `tool()` definition
//   - call(input, ctx) → execute(input, options) (with experimental_context cast)
//   - preflight(input) error → throw inside execute() (AI SDK propagates as tool error)
//   - permissionLevel → buildNeedsApproval (USD-aware resolver)
//
// Gets DELETED in Week 6 once every tool is migrated to native AI SDK
// `tool()` — see the Day 27-Week 6 plan in BENEFITS_SPEC_v07a.md.
//
// What's NOT wrapped (must be handled in engine.ts directly):
//   - Tool result truncation (maxResultSizeChars + summarizeOnTruncate)
//     — Day 3 work, lives in engine.ts onToolCall hook.
//   - microcompact dedupe (cacheable flag) — Day 3 cache layer.
//   - postWriteRefresh injection — Day 3 onStepFinish.
//   - needsInput (preflight pause-and-prompt) — only used by
//     add_recipient today; Day 4+ migration handles it natively when
//     that tool is rewritten.
// ---------------------------------------------------------------------------

import { tool, type Tool as AISDKTool } from 'ai';
import type { Tool as LegacyTool, ToolContext, PreflightResult } from '../types.js';
import { buildNeedsApproval } from './need-approval.js';

/**
 * Wrap one legacy Tool as an AI SDK Tool. The returned tool can be
 * dropped into `streamText({ tools })`.
 */
export function wrapLegacyTool(legacy: LegacyTool): AISDKTool {
  return tool({
    description: legacy.description,
    inputSchema: legacy.inputSchema,
    needsApproval: buildNeedsApproval(legacy.name),
    execute: async (input: unknown, options: { experimental_context?: unknown; abortSignal?: AbortSignal }) => {
      // Run preflight FIRST — matches engine.ts dispatch order
      // (preflight before guard pipeline before call). Preflight
      // failures throw so AI SDK surfaces them as tool errors back
      // to the model (which then re-asks the user or self-corrects).
      if (legacy.preflight) {
        const verdict: PreflightResult = legacy.preflight(input);
        if (!verdict.valid) {
          if ('needsInput' in verdict) {
            // pending_input is a complex pause-and-prompt flow that
            // doesn't have an AI SDK equivalent yet. add_recipient is
            // the lone tool that uses it today — Day 4+ migration of
            // that tool will handle this natively (or audric supplies
            // the values upstream so the tool sees a valid input).
            throw new Error(
              `Tool '${legacy.name}' requires structured input collection ` +
                `(pending_input pattern). The v2 engine does not yet support ` +
                `this; this tool will be migrated in Day 4+ of the rewrite.`,
            );
          }
          // Standard preflight failure → throw so AI SDK surfaces to
          // model. The model sees the error message and either
          // re-tries with corrected input or narrates the failure to
          // the user.
          throw new Error(verdict.error);
        }
      }

      // Cast experimental_context to ToolContext. The engine's
      // `buildToolContext` produces this shape; if a test or external
      // caller misconfigured it, the legacy tool's body will raise on
      // first field access (caught at execute boundary by AI SDK).
      const ctx = options.experimental_context as ToolContext;

      // Forward the AbortSignal — legacy tools that respect ctx.signal
      // get cancelled when the user aborts.
      const ctxWithSignal: ToolContext = {
        ...ctx,
        signal: options.abortSignal ?? ctx.signal,
      };

      const result = await legacy.call(input, ctxWithSignal);

      // Legacy result shape is { data, displayText? }. AI SDK
      // accepts any JSON-serializable output; the model sees the full
      // shape via tool_result back-reference. The engine's translator
      // (Day 3) extracts displayText for the EngineEvent shape audric
      // currently consumes.
      return result;
    },
  });
}

/**
 * Bulk-wrap a Tool[] into an AI SDK `ToolSet` (string-keyed object).
 *
 * Note: AI SDK's `ToolSet` is `Record<string, Tool>`. The keys are
 * what the LLM sees as tool names — they MUST match the legacy tool's
 * `name` field exactly so prompts that reference tool names by string
 * (system prompt, recipes) keep working.
 */
export function toAISDKTools(
  legacyTools: ReadonlyArray<LegacyTool>,
): Record<string, AISDKTool> {
  const out: Record<string, AISDKTool> = {};
  for (const t of legacyTools) {
    out[t.name] = wrapLegacyTool(t);
  }
  return out;
}
