// ---------------------------------------------------------------------------
// v2/define-tool.ts — Phase 2 tool factory (Zod-as-source-of-truth)
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Batch A Day 17 (2026-05-16).
//
// `defineTool({...})` is the migration target for all 39 tools currently
// using `buildTool({...})`. The ONLY external difference is that the
// hand-written `jsonSchema` field is GONE — derived from the Zod
// `inputSchema` by `zod-to-json-schema`. That removes ~10 LoC of
// hand-written duplication per tool (~400 LoC across 39 tools) and
// eliminates one entire class of bug: drift between the Zod schema
// (used by preflight + the legacy adapter) and the JSON schema (sent
// to Anthropic). With one source of truth, they can't drift.
//
// What stays IDENTICAL to buildTool:
//   - `Tool` shape returned (same fields, same call signature, same
//     `isReadOnly` / `permissionLevel` / `maxResultSizeChars` / etc.).
//   - Both engines (legacy `QueryEngine` AND v2 `AISDKEngine`) consume
//     the returned tool unchanged — no engine-side wiring change.
//   - Preflight, guard pipeline, USD-aware permission resolver: all
//     untouched. defineTool is a strictly NARROWER constructor.
//
// What this is NOT (deferred to Phase 3):
//   - Native `tool()` exports (Phase 3 = engine.ts rewrite to consume
//     AI SDK tools directly; tools at that point switch to exporting
//     AI SDK `tool()` instances).
//   - Retirement of `isReadOnly` / `isConcurrencySafe` flags (Phase 3+
//     when QueryEngine is deleted — those flags drive legacy engine
//     dispatch decisions).
//   - Native `needsApproval` callbacks on the tool itself (Phase 3 —
//     today the USD-aware resolver lives in `need-approval.ts` and is
//     attached by `tool-wrapper.ts` per-tool at wrap time).
//
// Migration shape per tool:
//   - `import { buildTool } from '../tool.js';` → `import { defineTool } from '../v2/define-tool.js';`
//   - Replace `buildTool({...})` → `defineTool({...})`
//   - Delete the `jsonSchema` field (auto-generated)
//
// Three open questions answered by the audit (see PHASE_2_TOOL_MIGRATION_BACKLOG.md):
//   Q1 — maxResultSizeChars stays as metadata on the returned Tool.
//        Engine consumes it identically (truncation in `budgetToolResult`).
//   Q2 — isReadOnly / isConcurrencySafe stay on the returned Tool.
//        Legacy engine reads them for parallel dispatch + early-dispatch
//        gating; v2 engine reads them for the same decisions.
//        Retired in Phase 3+ when QueryEngine is deleted.
//   Q3 — Both engines consume the returned Tool unchanged. Phase 2 is a
//        purely INTERNAL refactor — public surface preserved.
// ---------------------------------------------------------------------------

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import { buildTool, type BuildToolOptions } from '../tool.js';
import type { Tool, ToolJsonSchema } from '../types.js';

/**
 * Options for `defineTool` — identical to `BuildToolOptions` MINUS
 * the `jsonSchema` field (auto-generated from `inputSchema`).
 */
export type DefineToolOptions<TInput, TOutput> = Omit<
  BuildToolOptions<TInput, TOutput>,
  'jsonSchema'
>;

/**
 * Generate a `ToolJsonSchema` from a Zod schema. Stripped of
 * `$schema` / `definitions` / `$ref` so Anthropic accepts it; we
 * inline everything (`$refStrategy: 'none'`) since the engine's
 * tool inputs are all flat object shapes with no recursion.
 */
function zodToToolJsonSchema(schema: z.ZodType<unknown>): ToolJsonSchema {
  const generated = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  // Narrow to the shape Anthropic accepts. `zodToJsonSchema` for a
  // `z.object({...})` always produces a `{ type: 'object', properties,
  // required? }` root. Anything else here means the tool author used a
  // non-object Zod root, which we don't support (Anthropic tools
  // require object inputs).
  const s = generated as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  if (s.type !== 'object' || s.properties === undefined) {
    throw new Error(
      '[defineTool] inputSchema must be a z.object({...}). Got: ' +
        JSON.stringify(s.type),
    );
  }
  return {
    type: 'object',
    properties: s.properties,
    required: s.required ?? [],
  };
}

/**
 * Phase 2 tool factory. Identical to `buildTool` except `jsonSchema`
 * is auto-generated from the Zod `inputSchema` (Zod = single source
 * of truth, no more hand-written duplication).
 *
 * All other behavior — preflight, permission level, isReadOnly,
 * maxResultSizeChars, cacheable, flags — passes through to
 * `buildTool` unchanged.
 */
export function defineTool<TInput, TOutput>(
  opts: DefineToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  const jsonSchema = zodToToolJsonSchema(opts.inputSchema as z.ZodType<unknown>);
  return buildTool({
    ...opts,
    jsonSchema,
  });
}
