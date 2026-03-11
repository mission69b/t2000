import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { T2000 } from '@t2000/sdk';
import { errorResult } from '../errors.js';

export function registerReadTools(server: McpServer, agent: T2000): void {
  server.tool(
    't2000_balance',
    "Get agent's current balance — available (checking), savings, credit (debt), gas reserve, and net total. All values in USD.",
    {},
    async () => {
      try {
        const result = await agent.balance();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_address',
    "Get the agent's Sui wallet address.",
    {},
    async () => {
      try {
        const address = agent.address();
        return { content: [{ type: 'text', text: JSON.stringify({ address }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_positions',
    'View current lending positions across protocols (NAVI, Suilend) — deposits, borrows, APYs.',
    {},
    async () => {
      try {
        const result = await agent.positions();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_rates',
    'Get best available interest rates per asset across all lending protocols.',
    {},
    async () => {
      try {
        const result = await agent.rates();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_health',
    "Check the agent's health factor — measures how safe current borrows are. Below 1.0 risks liquidation.",
    {},
    async () => {
      try {
        const result = await agent.healthFactor();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_history',
    'View recent transactions (sends, saves, borrows, swaps, etc.).',
    { limit: z.number().optional().describe('Number of transactions to return (default: 20)') },
    async ({ limit }) => {
      try {
        const result = await agent.history({ limit });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_earnings',
    'View yield earnings from savings positions — total earned, daily rate, current APY.',
    {},
    async () => {
      try {
        const result = await agent.earnings();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
