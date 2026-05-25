// ---------------------------------------------------------------------------
// MCP tool adapter — converts MCP tool definitions into AI SDK native
// `tool()` instances keyed by namespaced name.
//
// **SPEC 37 v0.7a Phase 4 (2026-05-17, engine v2.1.0):** the underlying
// `@modelcontextprotocol/sdk` `Tool` type was replaced by the
// `McpClientManager`-local `McpToolDef`.
//
// **P4.1 Phase C (2026-05-25, engine v3.0.0):** legacy `Tool` adapter
// shape removed. Adapter now returns AI SDK `tool()` instances + a
// `ToolSet` (Record<name, Tool>). Engine merges these into the main
// tool set via `EngineConfig.tools = { ...engineTools, ...mcpTools }`.
//
// Why we DON'T route the engine through `client.tools()` directly:
// `McpClientManager.callTool` is the single chokepoint for the
// `McpResponseCache` (30s TTL, server-namespaced, load-bearing for the
// 40-60% NAVI read hit rate in production). Routing through `manager`
// preserves caching while the underlying transport uses `@ai-sdk/mcp`.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { tool, type Tool, type ToolSet } from 'ai';
import type { McpClientManager, McpToolDef } from './client.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface McpToolAdapterConfig {
  /** The McpClientManager to route calls through. */
  manager: McpClientManager;
  /** Server name this tool belongs to. */
  serverName: string;
  /**
   * Per-tool description override (the only field that doesn't reduce
   * to engine policy registry state).
   *
   * [P4.1 / v3.0.0 / 2026-05-25] `permissionLevel` + `isReadOnly`
   * removed from this interface. With native AI SDK tools the engine
   * looks up policy by tool name via `getToolPolicy(name)`; MCP tools
   * default to read-only/auto/cacheable. Hosts that need a non-default
   * policy register it via the policy registry at engine construction.
   */
  toolOverrides?: Record<string, {
    description?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Adapter: single MCP tool → engine Tool
// ---------------------------------------------------------------------------

/**
 * Convert a single MCP tool definition into a `[name, AISDKTool]` entry.
 * The tool name is namespaced as `{serverName}_{mcpToolName}`.
 *
 * Returns `[name, tool]` instead of a self-named object because AI SDK
 * tools don't carry their own name — the name lives in the `ToolSet`
 * record key.
 */
export function adaptMcpTool(
  mcpTool: McpToolDef,
  config: McpToolAdapterConfig,
  // The `permissionLevel` / `isReadOnly` overrides are consumed by the
  // engine policy registry. With native AI SDK tools, the engine
  // dispatcher looks up policy by tool name via `getToolPolicy(name)`.
  // For MCP tools the default (read-only / auto / cacheable) is correct;
  // hosts that need a non-default policy register it via the policy
  // registry at engine construction time.
): { name: string; tool: Tool<Record<string, unknown>, unknown> } {
  const overrides = config.toolOverrides?.[mcpTool.name];
  const namespacedName = `${config.serverName}_${mcpTool.name}`;

  const aiTool = tool({
    description:
      overrides?.description ?? mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
    inputSchema: z.record(z.string(), z.unknown()),
    execute: async (input: Record<string, unknown>) => {
      const result = await config.manager.callTool(
        config.serverName,
        mcpTool.name,
        input,
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
        return { error: data };
      }

      return data;
    },
  });

  return { name: namespacedName, tool: aiTool };
}

// ---------------------------------------------------------------------------
// Batch adapter: all tools from a server → ToolSet
// ---------------------------------------------------------------------------

/**
 * Convert all discovered tools from an MCP server into a `ToolSet`.
 * Call this after `manager.connect(config)` completes successfully.
 */
export function adaptAllMcpTools(config: McpToolAdapterConfig): ToolSet {
  const conn = config.manager.getConnection(config.serverName);
  if (!conn || conn.status !== 'connected') {
    return {};
  }
  const set: ToolSet = {};
  for (const t of conn.tools) {
    const entry = adaptMcpTool(t, config);
    set[entry.name] = entry.tool;
  }
  return set;
}

/**
 * Convenience: adapt tools from all connected servers into a single ToolSet.
 */
export function adaptAllServerTools(
  manager: McpClientManager,
  serverConfigs?: Record<string, Omit<McpToolAdapterConfig, 'manager' | 'serverName'>>,
): ToolSet {
  const set: ToolSet = {};
  for (const { serverName, tool: mcpTool } of manager.listAllTools()) {
    const serverOpts = serverConfigs?.[serverName] ?? {};
    const entry = adaptMcpTool(mcpTool, {
      manager,
      serverName,
      ...serverOpts,
    });
    set[entry.name] = entry.tool;
  }
  return set;
}
