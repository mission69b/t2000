import { z } from 'zod';
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';
import type { Tool, ToolJsonSchema, PermissionLevel } from './types.js';
import type { McpClientManager } from './mcp-client.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface McpToolAdapterConfig {
  /** The McpClientManager to route calls through. */
  manager: McpClientManager;
  /** Server name this tool belongs to. */
  serverName: string;
  /** Override permission level for all tools from this server. */
  permissionLevel?: PermissionLevel;
  /** Override isReadOnly for all tools from this server. */
  isReadOnly?: boolean;
  /** Per-tool overrides keyed by MCP tool name. */
  toolOverrides?: Record<string, {
    permissionLevel?: PermissionLevel;
    isReadOnly?: boolean;
    description?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Adapter: single MCP tool → engine Tool
// ---------------------------------------------------------------------------

/**
 * Convert a single MCP tool definition into an engine Tool.
 * The tool name is namespaced as `{serverName}_{mcpToolName}`.
 */
export function adaptMcpTool(
  mcpTool: McpToolDef,
  config: McpToolAdapterConfig,
): Tool {
  const overrides = config.toolOverrides?.[mcpTool.name];
  const isReadOnly = overrides?.isReadOnly ?? config.isReadOnly ?? true;
  const permissionLevel = overrides?.permissionLevel ?? config.permissionLevel ?? 'auto';
  const namespacedName = `${config.serverName}_${mcpTool.name}`;

  const jsonSchema: ToolJsonSchema = (mcpTool.inputSchema ?? {
    type: 'object',
    properties: {},
  }) as ToolJsonSchema;

  return {
    name: namespacedName,
    description: overrides?.description ?? mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
    inputSchema: z.record(z.unknown()),
    jsonSchema,
    isReadOnly,
    isConcurrencySafe: isReadOnly,
    permissionLevel,
    flags: {},

    async call(input, _context) {
      const result = await config.manager.callTool(
        config.serverName,
        mcpTool.name,
        input as Record<string, unknown>,
      );

      const textContent = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n');

      let data: unknown;
      try {
        data = JSON.parse(textContent);
      } catch {
        data = textContent || result.content;
      }

      if (result.isError) {
        return { data: { error: data } };
      }

      return { data };
    },
  };
}

// ---------------------------------------------------------------------------
// Batch adapter: all tools from a server → engine Tools
// ---------------------------------------------------------------------------

/**
 * Convert all discovered tools from an MCP server into engine Tools.
 * Call this after `manager.connect(config)` completes successfully.
 */
export function adaptAllMcpTools(config: McpToolAdapterConfig): Tool[] {
  const conn = config.manager.getConnection(config.serverName);
  if (!conn || conn.status !== 'connected') {
    return [];
  }
  return conn.tools.map((t) => adaptMcpTool(t, config));
}

/**
 * Convenience: adapt tools from all connected servers.
 * Returns a flat array of engine Tools, namespaced by server name.
 */
export function adaptAllServerTools(
  manager: McpClientManager,
  serverConfigs?: Record<string, Omit<McpToolAdapterConfig, 'manager' | 'serverName'>>,
): Tool[] {
  const allTools: Tool[] = [];

  for (const { serverName, tool } of manager.listAllTools()) {
    const serverOpts = serverConfigs?.[serverName] ?? {};
    allTools.push(adaptMcpTool(tool, {
      manager,
      serverName,
      ...serverOpts,
    }));
  }

  return allTools;
}
