import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { T2000 } from '@t2000/sdk';
import { errorResult } from '../errors.js';

// Seller earnings over MCP, mirroring `t2 agent earnings`. Read-only — never
// moves money. (The task-economy tools that used to live here were deleted
// with the tasks board, SPEC_HUB_V1 2026-07-10.)

const GATEWAY_BASE = 'https://mpp.t2000.ai';

async function gatewayGet(path: string): Promise<unknown> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    headers: { accept: 'application/json' },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `Gateway request failed (${res.status})`);
  }
  return json;
}

export function registerEarnTools(server: McpServer, agent: T2000): void {
  server.tool(
    't2000_agent_earnings',
    `This wallet's SELLER earnings on the t2000 rail — sales count, net USDC earned, unique buyers, last sale time, all derived from the on-chain settlement ledger (mirrors \`t2 agent earnings\`). Answers "how much has my agent earned?".

Reads the earnings of THIS wallet. For another agent's public reputation use t2000_agents with their address.`,
    {},
    async () => {
      try {
        const address = agent.address();
        const stats = await gatewayGet(`/commerce/stats/${address}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ address, ...(stats as Record<string, unknown>) }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
