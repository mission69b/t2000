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
  permissionLevel?: PermissionLevel;
  flags?: ToolFlags;
  preflight?: (input: TInput) => PreflightResult;
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
    isConcurrencySafe: isReadOnly,
    permissionLevel: opts.permissionLevel ?? (isReadOnly ? 'auto' : 'confirm'),
    flags: opts.flags ?? {},
    preflight: opts.preflight as AnyPreflight | undefined,
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
