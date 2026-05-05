import type { z } from 'zod';
import type {
  PermissionLevel,
  PreflightResult,
  Tool,
  ToolContext,
  ToolFlags,
  ToolJsonSchema,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// buildTool — factory for creating typed, permission-aware tools
// ---------------------------------------------------------------------------

export interface BuildToolOptions<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: ToolJsonSchema;
  call: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  isReadOnly?: boolean;
  /**
   * [SPEC 9 v0.1.3 P9.4] When `false`, the tool opts out of mid-stream
   * `EarlyToolDispatcher` execution and is forced through the post-stream
   * guard loop where `tool.preflight` runs (Tier 0 of `runGuards`).
   *
   * Default: `isReadOnly` (mirrors v1 behavior — read-only tools are
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

export function buildTool<TInput, TOutput>(
  opts: BuildToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  const isReadOnly = opts.isReadOnly ?? true;
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: opts.inputSchema,
    jsonSchema: opts.jsonSchema,
    call: opts.call,
    isReadOnly,
    isConcurrencySafe: opts.isConcurrencySafe ?? isReadOnly,
    permissionLevel: opts.permissionLevel ?? (isReadOnly ? 'auto' : 'confirm'),
    flags: opts.flags ?? {},
    preflight: opts.preflight as AnyPreflight | undefined,
    maxResultSizeChars: opts.maxResultSizeChars,
    summarizeOnTruncate: opts.summarizeOnTruncate,
    cacheable: opts.cacheable,
  };
}

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

export function toolsToDefinitions(tools: Tool[]): {
  name: string;
  description: string;
  input_schema: ToolJsonSchema;
}[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema,
  }));
}

export function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}
