// ---------------------------------------------------------------------------
// v2/tool-helpers.ts — author-facing helpers for native AI SDK `tool()` shape
// ---------------------------------------------------------------------------
//
// SPEC AI SDK HARDENING P4.1 Phase A (pilot) — 2026-05-25.
//
// Lets tool authors write native AI SDK `tool({...})` instances while keeping
// the engine's defense-in-depth (preflight + 14-guard pipeline + ToolResult
// unwrap + AbortSignal forwarding + per-tool result truncation). Without
// this helper, every native tool's `execute` body would have to inline all
// five concerns — ~30 LoC of identical boilerplate × N tools.
//
// Author-facing shape (the AI SDK docs example, with engine concerns wrapped):
//
//   import { tool } from 'ai';
//   import { z } from 'zod';
//   import { wrapEngineExecute, buildNeedsApproval } from '@t2000/engine';
//
//   export const myToolNative = tool({
//     description: '...',
//     inputSchema: z.object({...}),
//     needsApproval: buildNeedsApproval('my_tool'),
//     execute: wrapEngineExecute('my_tool', {
//       preflight: (input) => ({ valid: true }),
//       call: async (input, ctx) => ({ data: {...}, displayText: '...' }),
//     }),
//   });
//
// Engine policy / flags / cacheable / maxResultSizeChars are read from the
// sidecar registries (`v2/tool-policy.ts` + `tool-flags.ts`) by name —
// authors don't repeat them inside the tool definition.
//
// Pattern parity with `wrapLegacyTool` (tool-wrapper.ts L44-150):
//   - Preflight runs FIRST (cheap early-exit before InternalContext extract)
//   - `runGuardsForTool` runs SECOND (14 guards; throws GuardBlockedError on block)
//   - `call(input, ctx)` runs THIRD (the actual tool body)
//   - Result unwrap returns `result.data` (AI SDK sees the inner payload, not
//     the `{ data, displayText }` envelope — matches legacy QueryEngine
//     `executeTool` behavior)
//   - AbortSignal merges `options.abortSignal` into `ctx.signal` so tools
//     that respect signal can be cancelled by the user
//
// What this helper does NOT do (yet):
//   - `maxResultSizeChars` truncation — TODO Phase B (engine-side onToolCall
//     hook reads the policy and truncates). For Phase A pilot the existing
//     `wrapLegacyTool` path still owns it for tools that go through it.
//   - microcompact / cache layer — turn-read cache reads policy by name;
//     pattern unchanged.
// Deletes in Phase C alongside `tool-wrapper.ts` + `define-tool.ts` when
// the engine consumes native ToolSet directly and every tool ships in
// native shape.
// ---------------------------------------------------------------------------

import type { PreflightResult, ToolContext, ToolResult, ToolFlags } from '../types.js';
import { asInternalContext } from './internal-context.js';
import { runGuardsForTool, GuardBlockedError } from './guard-runner.js';
import { getToolFlags } from '../tool-flags.js';

// Re-export for tool authors so they import everything from one place.
export { buildNeedsApproval } from './need-approval.js';

/**
 * Options accepted by {@link wrapEngineExecute}. Mirrors the subset of
 * `defineTool` that's tool-author-specific (NOT in the sidecar registries):
 *
 *  - `preflight` — cheap input validation that runs before guards.
 *    Optional. Returns `{ valid: true }` or `{ valid: false, error: '...' }`.
 *  - `call` — the actual tool body. Receives the validated input + the
 *    engine's `ToolContext` (extracted from `experimental_context`).
 *    Returns `{ data, displayText? }` — the engine returns `data` to AI
 *    SDK and surfaces `displayText` to the host UI via the legacy path
 *    (TODO Phase B: native shape can emit `displayText` via a tool-output
 *    transform; not pilot-blocking).
 */
export interface WrapEngineExecuteOptions<TInput, TOutput> {
  preflight?: (input: TInput) => PreflightResult;
  call: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
}

/**
 * AI SDK v6's `execute` callback signature. Inlined here to avoid pulling
 * `@ai-sdk/provider-utils` as a direct dep — the public `ai` barrel doesn't
 * re-export `ToolExecuteFunction`. Stable across AI SDK v6.x.
 */
type AISDKExecuteFn<TInput, TOutput> = (
  input: TInput,
  options: {
    toolCallId?: string;
    abortSignal?: AbortSignal;
    experimental_context?: unknown;
    messages?: unknown[];
  },
) => Promise<TOutput>;

/**
 * Wrap a tool's `preflight` + `call` body into the AI SDK `tool({execute})`
 * shape, with engine defense-in-depth applied transparently.
 *
 * Returns a callback the author drops into `tool({ execute: ... })`.
 *
 * Preflight + guards run BEFORE the body, matching `wrapLegacyTool`'s
 * dispatch order. The 14-guard pipeline runs only when the engine config
 * has `guards` set (audric/web-v2 currently doesn't wire it; engine
 * smoke tests do). Guard blocks throw `GuardBlockedError` so AI SDK
 * surfaces the rejection back to the model as a tool error.
 *
 * `ToolResult.data` is returned to AI SDK (NOT the full envelope). This
 * matches the legacy QueryEngine `executeTool` (orchestration.ts) and
 * `wrapLegacyTool` (tool-wrapper.ts L148) — the model sees the inner
 * payload directly so `result.__canvas === true` checks downstream work
 * correctly.
 *
 * @param toolName - Tool name as registered in `TOOL_POLICY` + `TOOL_FLAGS`.
 *   Used by the guard runner to look up flags (irreversible, requiresBalance,
 *   affectsHealth) for tier-specific guards.
 * @param opts - Author-supplied preflight + call body.
 */
export function wrapEngineExecute<TInput, TOutput>(
  toolName: string,
  opts: WrapEngineExecuteOptions<TInput, TOutput>,
): AISDKExecuteFn<TInput, TOutput> {
  const executeFn = async (
    input: TInput,
    options: Parameters<AISDKExecuteFn<TInput, TOutput>>[1],
  ): Promise<TOutput> => {
    if (opts.preflight) {
      const verdict = opts.preflight(input);
      if (!verdict.valid) {
        throw new Error(verdict.error);
      }
    }

    const internal = asInternalContext(options.experimental_context);

    const flags: ToolFlags = getToolFlags(toolName);

    const guardOutcome = runGuardsForTool(
      // Synthesize a minimal GuardToolView for the guard runner. After
      // P4.1 Phase C the runner accepts `{name, flags, preflight}`
      // directly — no cast through unknown needed.
      {
        name: toolName,
        flags,
        preflight: opts.preflight as
          | ((input: unknown) => PreflightResult)
          | undefined,
      },
      {
        id: options.toolCallId ?? `${toolName}-${Date.now()}`,
        name: toolName,
        input,
      },
      internal,
    );

    if (!guardOutcome.allowed) {
      throw new GuardBlockedError(
        guardOutcome.blockGate ?? 'unknown',
        guardOutcome.blockReason ?? 'Guard blocked execution',
      );
    }

    const ctxForTool: ToolContext = {
      ...internal.toolContext,
      signal: options.abortSignal ?? internal.toolContext.signal,
    };

    const result = await opts.call(input, ctxForTool);
    return result.data;
  };

  // [P4.1 / v3.0.0 / 2026-05-25] Attach the bare call body + preflight as
  // non-enumerable properties on the returned execute function. The engine
  // dispatcher (AI SDK runtime) never sees these — only the test helpers
  // in `__tests__/_helpers/call-tool-body.ts` reach for them to invoke
  // the body directly with `{ data, displayText }` semantics that legacy
  // `tool.call(input, ctx)` returned, OR to test preflight in isolation
  // (no need to spin up an AI SDK runtime).
  //
  // This is a test-only side door. Production code MUST go through
  // `execute` so guards/preflight run. The non-enumerable flag ensures
  // these don't leak via `JSON.stringify`, spread `{...tool}`, `Object.keys`,
  // or `for-in` — they're invisible to anything that doesn't reach for
  // them by exact property name.
  Object.defineProperty(executeFn, '__t2000_callBody', {
    value: opts.call,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  if (opts.preflight) {
    Object.defineProperty(executeFn, '__t2000_preflight', {
      value: opts.preflight,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  return executeFn as AISDKExecuteFn<TInput, TOutput>;
}
