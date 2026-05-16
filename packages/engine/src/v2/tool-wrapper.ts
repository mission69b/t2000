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
import type { Tool as LegacyTool, PreflightResult } from '../types.js';
import { buildNeedsApproval } from './need-approval.js';
import { asInternalContext } from './internal-context.js';
import { runGuardsForTool, GuardBlockedError } from './guard-runner.js';

/**
 * Wrap one legacy Tool as an AI SDK Tool. The returned tool can be
 * dropped into `streamText({ tools })`.
 */
export function wrapLegacyTool(legacy: LegacyTool): AISDKTool {
  return tool({
    description: legacy.description,
    inputSchema: legacy.inputSchema,
    needsApproval: buildNeedsApproval(legacy.name),
    execute: async (
      input: unknown,
      options: {
        experimental_context?: unknown;
        abortSignal?: AbortSignal;
        toolCallId?: string;
      },
    ) => {
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

      // Extract InternalContext (engine-internal state) from
      // experimental_context. Throws with a useful message if the
      // engine forgot to thread it (caught by AI SDK as a tool error).
      const internal = asInternalContext(options.experimental_context);

      // Run the 14-guard pipeline (Day 3). When `internal.guardConfig`
      // is undefined, the runner returns `{ allowed: true }` immediately
      // — no overhead. Block verdicts throw `GuardBlockedError` so AI
      // SDK surfaces the rejection back to the model in tool-error.
      const guardOutcome = runGuardsForTool(
        legacy,
        {
          id: options.toolCallId ?? `${legacy.name}-${Date.now()}`,
          name: legacy.name,
          input,
        },
        internal,
      );

      if (!guardOutcome.allowed) {
        if (guardOutcome.needsStructuredInput) {
          throw new Error(
            `Tool '${legacy.name}' requires structured input — pending_input ` +
              `pattern not yet supported in v2 engine.`,
          );
        }
        throw new GuardBlockedError(
          guardOutcome.blockGate ?? 'unknown',
          guardOutcome.blockReason ?? 'Guard blocked execution',
        );
      }

      // Forward the AbortSignal — legacy tools that respect ctx.signal
      // get cancelled when the user aborts.
      const ctxForLegacy = {
        ...internal.toolContext,
        signal: options.abortSignal ?? internal.toolContext.signal,
      };

      const result = await legacy.call(input, ctxForLegacy);

      // Unwrap the legacy `ToolResult<T>` wrapper before handing
      // the value to AI SDK. Mirrors what the legacy QueryEngine's
      // `executeTool` (orchestration.ts) does — it returns `result.data`,
      // not the full `{ data, displayText }`. Returning the wrapper
      // here propagates a one-level-too-deep shape to every downstream
      // consumer:
      //   - the LLM sees `{ data: {…}, displayText: "…" }` instead of
      //     the inner payload (more confusing tokens, no functional gain
      //     since `displayText` is meant for the host UI, not the model);
      //   - the bridge's `tool-result` translator forwards `event.output`
      //     verbatim, so `result.__canvas === true` checks fail (the
      //     `__canvas` signal lives on `result.data.__canvas`);
      //   - AISDKEngine.runStream persists `JSON.stringify(event.output)`
      //     into the session ledger with the wrapped shape, so audric's
      //     rehydration synthesizer `isCanvasShapedResult(tool.result)`
      //     also misses the signal → no `CanvasTimelineBlock` on reload.
      //
      // The fix is intentionally narrow: unwrap to `result.data` to match
      // the legacy contract exactly. The bridge fix (event-bridge.ts) is
      // the partner change that closes the live-canvas path; together
      // they restore parity with QueryEngine for canvas + todo_update
      // side-channel events. See BENEFITS_SPEC_v07a.md Day 17b for the
      // production smoke trace that motivated this.
      return result.data;
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
