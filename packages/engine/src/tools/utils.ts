import type { T2000 } from '@t2000/sdk';
import type { McpClientManager } from '../mcp-client.js';
import { NAVI_SERVER_NAME } from '../navi-config.js';
import type { ToolContext } from '../types.js';

export function hasAgent(context: ToolContext): boolean {
  return !!context.agent;
}

export function requireAgent(context: ToolContext): T2000 {
  if (!context.agent) {
    throw new Error(
      'Tool requires a T2000 agent instance — pass `agent` in EngineConfig',
    );
  }
  return context.agent as T2000;
}

/**
 * Check if context has an MCP manager with a connected NAVI server
 * and a wallet address for address-dependent reads.
 */
export function hasNaviMcp(context: ToolContext): boolean {
  if (!context.mcpManager || !context.walletAddress) return false;
  const mgr = context.mcpManager as McpClientManager;
  return mgr.isConnected(NAVI_SERVER_NAME);
}

/**
 * Get the MCP client manager from context (assumes hasNaviMcp() is true).
 */
export function getMcpManager(context: ToolContext): McpClientManager {
  return context.mcpManager as McpClientManager;
}

/**
 * Get the wallet address from context (assumes hasNaviMcp() is true).
 */
export function getWalletAddress(context: ToolContext): string {
  return context.walletAddress!;
}
