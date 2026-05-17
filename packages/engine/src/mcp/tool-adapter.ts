// ---------------------------------------------------------------------------
// MCP tool adapter — converts MCP tool definitions into engine-native
// `Tool` objects (the legacy `defineTool` / `Tool` shape that
// `@t2000/engine` exposes to the LLM).
//
// **SPEC 37 v0.7a Phase 4 (2026-05-17, engine v2.1.0):** the underlying
// `@modelcontextprotocol/sdk` `Tool` type was replaced by the
// `McpClientManager`-local `McpToolDef` (which already wraps the AI SDK
// `createMCPClient().listTools()` result; see `./client.ts` migration
// notes). Public function signatures (`adaptMcpTool`, `adaptAllMcpTools`,
// `adaptAllServerTools`, `McpToolAdapterConfig`) are preserved verbatim
// — the existing 4 `__tests__/mcp-client.test.ts` adapter cases + 21
// `__tests__/read-tools-mcp.test.ts` cases pass without modification.
//
// Why we DON'T route the engine Tool directly through `client.tools()`:
// `McpClientManager.callTool` is the single chokepoint for the
// `McpResponseCache` (30s TTL, server-namespaced, load-bearing for the
// 40-60% NAVI read hit rate in production). Routing through `manager`
// preserves caching while the underlying transport switches to
// `@ai-sdk/mcp`.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { Tool, ToolJsonSchema, PermissionLevel } from '../types.js';
import type { McpClientManager, McpToolDef } from './client.js';

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
  }) as unknown as ToolJsonSchema;

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
