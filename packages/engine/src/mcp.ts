import type { Tool, ToolContext } from './types.js';
import { getDefaultTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// MCP tool descriptor — the shape MCP servers need to register tools
// ---------------------------------------------------------------------------

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Convert engine tools → MCP tool descriptors
// ---------------------------------------------------------------------------

/**
 * Builds MCP-compatible tool descriptors from engine tools.
 * Each tool's `call()` is wrapped to return the MCP response format.
 *
 * Usage with @modelcontextprotocol/sdk:
 * ```
 * const descriptors = buildMcpTools(context);
 * for (const desc of descriptors) {
 *   server.tool(desc.name, desc.description, desc.inputSchema, desc.handler);
 * }
 * ```
 */
export function buildMcpTools(
  context: ToolContext,
  tools?: Tool[],
): McpToolDescriptor[] {
  const engineTools = tools ?? getDefaultTools();

  return engineTools.map((tool) => ({
    name: `audric_${tool.name}`,
    description: tool.description,
    inputSchema: tool.jsonSchema as unknown as Record<string, unknown>,

    async handler(args: Record<string, unknown>) {
      try {
        const parsed = tool.inputSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
              }),
            }],
            isError: true,
          };
        }

        const result = await tool.call(parsed.data, context);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result.data),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Tool execution failed',
            }),
          }],
          isError: true,
        };
      }
    },
  }));
}

/**
 * Register all engine tools with an MCP server instance.
 * Convenience wrapper for the common pattern.
 */
export function registerEngineTools(
  server: { tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: Record<string, unknown>) => Promise<unknown>) => void },
  context: ToolContext,
  tools?: Tool[],
): void {
  const descriptors = buildMcpTools(context, tools);
  for (const desc of descriptors) {
    server.tool(desc.name, desc.description, desc.inputSchema, desc.handler);
  }
}
