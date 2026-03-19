import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { T2000 } from '@t2000/sdk';
import { errorResult } from '../errors.js';

export function registerReadTools(server: McpServer, agent: T2000): void {

  // ---------------------------------------------------------------------------
  // Composite tool — the single best call for "how's my account?"
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_overview',
    'Complete account snapshot in ONE call — balance, savings positions, investment portfolio, health factor, yield earnings, fund status, and pending rewards. Use this for morning briefings, general account questions, or any time you need the full picture. Prefer this over calling individual tools.',
    {},
    async () => {
      try {
        const [balance, positions, portfolio, health, earnings, fundStatus, pendingRewards] =
          await Promise.allSettled([
            agent.balance(),
            agent.positions(),
            agent.getPortfolio(),
            agent.healthFactor(),
            agent.earnings(),
            agent.fundStatus(),
            agent.getPendingRewards(),
          ]);

        const result = {
          balance: balance.status === 'fulfilled' ? balance.value : null,
          positions: positions.status === 'fulfilled' ? positions.value : null,
          portfolio: portfolio.status === 'fulfilled' ? {
            ...portfolio.value,
            positions: portfolio.value.positions.map(p => ({
              ...p,
              ...(p.currentPrice === 0 && p.totalAmount > 0 ? { note: 'price unavailable' } : {}),
            })),
          } : null,
          health: health.status === 'fulfilled' ? health.value : null,
          earnings: earnings.status === 'fulfilled' ? earnings.value : null,
          fundStatus: fundStatus.status === 'fulfilled' ? fundStatus.value : null,
          pendingRewards: pendingRewards.status === 'fulfilled' ? pendingRewards.value : null,
        };

        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Individual read tools
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_balance',
    "Get agent's current balance — available (checking), savings, credit (debt), gas reserve, and net total. All values in USD. For a full account snapshot, prefer t2000_overview instead.",
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
    "Get the agent's Sui wallet address for receiving funds.",
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
    'View current lending positions across protocols (NAVI, Suilend) — deposits, borrows, APYs. For a full account snapshot, prefer t2000_overview instead.',
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
    'Get best available interest rates per asset across all lending protocols. Use alongside t2000_positions to compare current vs best rates. Use with t2000_rebalance (dryRun: true) to preview optimization.',
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
    "Check the agent's health factor — measures how safe current borrows are. Below 1.0 risks liquidation. Also shows supplied, borrowed, max borrow, and liquidation threshold.",
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
    'View recent transactions (sends, saves, borrows, swaps, investments). Use for activity summaries and weekly recaps.',
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
    'View yield earnings from savings positions — total earned, daily rate, current APY. For a full account snapshot, prefer t2000_overview instead.',
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

  server.tool(
    't2000_fund_status',
    'Detailed savings analytics — total supplied, current APY, earned today, earned all-time, projected monthly yield. More detailed than t2000_earnings.',
    {},
    async () => {
      try {
        const result = await agent.fundStatus();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_pending_rewards',
    'Check pending protocol rewards from lending positions WITHOUT claiming them. Shows claimable reward tokens per protocol and asset. Use t2000_claim_rewards to actually collect and convert to USDC.',
    {},
    async () => {
      try {
        const result = await agent.getPendingRewards();
        return { content: [{ type: 'text', text: JSON.stringify({ rewards: result, count: result.length }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_deposit_info',
    'Get deposit instructions — wallet address, supported networks, accepted assets. Use when the user asks how to fund or top up their account.',
    {},
    async () => {
      try {
        const result = await agent.deposit();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_all_rates',
    'Compare interest rates across ALL protocols side-by-side for every asset. Shows NAVI vs Suilend rates per asset. Use when the user asks "am I getting the best rate?" or wants to compare protocols. NOTE: Do NOT use this to decide where to save — t2000_save always saves USDC at the best USDC rate. This tool is for informational comparisons and for deciding whether to t2000_rebalance into a different asset.',
    {},
    async () => {
      try {
        const result = await agent.allRatesAcrossAssets();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // MPP Service Discovery
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_services',
    'Discover available MPP services the agent can pay for with t2000_pay. Returns all services with URLs, endpoints, descriptions, and prices. Use this BEFORE t2000_pay to find the right URL and request format. Includes AI models, search, media, weather, maps, code execution, email, gift cards, physical mail, and more.',
    {},
    async () => {
      try {
        const res = await fetch('https://mpp.t2000.ai/api/services');
        if (!res.ok) throw new Error(`Service discovery failed (${res.status})`);
        const services = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(services) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Sentinel tools
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_sentinel_list',
    'List active Sui Sentinels — AI agents with prize pools you can attack. Shows name, attack fee, prize pool, and attack count. Use this for bounty hunting.',
    {},
    async () => {
      try {
        const sentinels = await agent.sentinelList();
        const serializable = sentinels.map(s => ({
          ...s,
          attackFee: s.attackFee.toString(),
          attackFeeSui: Number(s.attackFee) / 1e9,
          prizePool: s.prizePool.toString(),
          prizePoolSui: Number(s.prizePool) / 1e9,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(serializable) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_sentinel_info',
    'Get detailed info about a specific Sui Sentinel — model, system prompt, prize pool, attack history. Use the sentinel ID or object ID from t2000_sentinel_list.',
    { id: z.string().describe('Sentinel agent ID or object ID') },
    async ({ id }) => {
      try {
        const s = await agent.sentinelInfo(id);
        return { content: [{ type: 'text', text: JSON.stringify({
          ...s,
          attackFee: s.attackFee.toString(),
          attackFeeSui: Number(s.attackFee) / 1e9,
          prizePool: s.prizePool.toString(),
          prizePoolSui: Number(s.prizePool) / 1e9,
        }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Contacts & Portfolio
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_contacts',
    'List saved contacts (name → address mappings). Use contact names with t2000_send instead of raw addresses. Use t2000_contact_add to save new contacts.',
    {},
    async () => {
      try {
        const contacts = agent.contacts.list();
        return { content: [{ type: 'text', text: JSON.stringify({ contacts }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_portfolio',
    'Show investment portfolio — positions, cost basis, current value, unrealized/realized P&L, strategy groupings. For a full account snapshot, prefer t2000_overview instead.',
    {},
    async () => {
      try {
        const result = await agent.getPortfolio();
        const enriched = {
          ...result,
          positions: result.positions.map(p => ({
            ...p,
            ...(p.currentPrice === 0 && p.totalAmount > 0 ? { note: 'price unavailable' } : {}),
          })),
        };
        return { content: [{ type: 'text', text: JSON.stringify(enriched) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
