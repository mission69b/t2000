// ---------------------------------------------------------------------------
// v2/define-tool.ts — Phase 2 tool factory (Zod-as-source-of-truth)
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 (Days 17–20b, 2026-05-16 → 2026-05-17).
//
// `defineTool({...})` is the canonical tool factory. The legacy
// `buildTool` was deleted in Day 20b cleanup once all 39 in-tree tools
// migrated to `defineTool`. The ONLY observable difference vs. the
// retired `buildTool` is that the hand-written `jsonSchema` field is
// GONE — derived from the Zod `inputSchema` by `zod-to-json-schema`.
// That removed ~10 LoC of hand-written duplication per tool (~400 LoC
// across 39 tools) and eliminated one entire class of bug: drift between
// the Zod schema (used by preflight + the legacy adapter) and the JSON
// schema (sent to Anthropic). With one source of truth, they can't drift.
//
// What stays IDENTICAL to the retired buildTool:
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
// ---------------------------------------------------------------------------

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type {
  PermissionLevel,
  PreflightResult,
  Tool,
  ToolContext,
  ToolFlags,
  ToolJsonSchema,
  ToolResult,
} from '../types.js';

/**
 * Options for `defineTool`. Identical to the retired `BuildToolOptions`
 * MINUS the `jsonSchema` field (auto-generated from `inputSchema`).
 */
export interface DefineToolOptions<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  call: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  isReadOnly?: boolean;
  /**
   * [SPEC 9 v0.1.3 P9.4] When `false`, the tool opts out of mid-stream
   * `EarlyToolDispatcher` execution and is forced through the post-stream
   * guard loop where `tool.preflight` runs (Tier 0 of `runGuards`).
   *
   * Default: `isReadOnly` (mirrors legacy behavior — read-only tools are
   * considered concurrency-safe by default).
   *
   * Set to `false` for read-only tools that need preflight before
   * executing. Notable example: `add_recipient` returns `needsInput`
   * from preflight to pause the turn for an inline form. If it ran
   * via early-dispatch, the tool's `call()` would fire BEFORE preflight
   * is consulted (early-dispatch skips the guard loop), and the form
   * pause path would be unreachable.
   */
  isConcurrencySafe?: boolean;
  permissionLevel?: PermissionLevel;
  flags?: ToolFlags;
  preflight?: (input: TInput) => PreflightResult;
  maxResultSizeChars?: number;
  summarizeOnTruncate?: (result: string, maxChars: number) => string;
  /**
   * [v1.5.1] See `Tool.cacheable`. Default `true`. Set `false` for
   * tools whose results depend on mutable on-chain state.
   */
  cacheable?: boolean;
}

type AnyPreflight = (input: unknown) => PreflightResult;

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
 * Phase 2 canonical tool factory. Produces a `Tool` ready to register
 * with either engine (legacy `QueryEngine` or v2 `AISDKEngine`).
 *
 * Defaults mirror the retired `buildTool`:
 *   - `isReadOnly` defaults to `true`
 *   - `isConcurrencySafe` defaults to `isReadOnly`
 *   - `permissionLevel` defaults to `auto` (read) / `confirm` (write)
 *   - `flags` defaults to `{}` (canonical flags are later merged from
 *     `tool-flags.ts` by `applyToolFlags` in `tools/index.ts`)
 *
 * `jsonSchema` is auto-generated from the Zod `inputSchema` (Zod = single
 * source of truth, no more hand-written duplication).
 */
export function defineTool<TInput, TOutput>(
  opts: DefineToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  const isReadOnly = opts.isReadOnly ?? true;
  const jsonSchema = zodToToolJsonSchema(
    opts.inputSchema as z.ZodType<unknown>,
  );
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: opts.inputSchema,
    jsonSchema,
    call: opts.call,
    isReadOnly,
    isConcurrencySafe: opts.isConcurrencySafe ?? isReadOnly,
    permissionLevel:
      opts.permissionLevel ?? (isReadOnly ? 'auto' : 'confirm'),
    flags: opts.flags ?? {},
    preflight: opts.preflight as AnyPreflight | undefined,
    maxResultSizeChars: opts.maxResultSizeChars,
    summarizeOnTruncate: opts.summarizeOnTruncate,
    cacheable: opts.cacheable,
  };
}
