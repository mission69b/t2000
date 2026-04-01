import type { z } from 'zod';
import type {
  PermissionLevel,
  Tool,
  ToolContext,
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
}

export function buildTool<TInput, TOutput>(
  opts: BuildToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: opts.inputSchema,
    jsonSchema: opts.jsonSchema,
    call: opts.call,
    isReadOnly: opts.isReadOnly ?? true,
    isConcurrencySafe: opts.isReadOnly ?? true,
    permissionLevel: opts.permissionLevel ?? (opts.isReadOnly === false ? 'confirm' : 'auto'),
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
