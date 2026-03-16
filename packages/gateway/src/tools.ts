import { z, type ZodObject, type ZodRawShape } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { T2000 } from '@t2000/sdk';
import { INVESTMENT_ASSETS, type InvestmentAsset } from '@t2000/sdk';
import type { ToolDefinition } from './llm/types.js';

export interface GatewayTool {
  name: string;
  description: string;
  schema: ZodObject<ZodRawShape>;
  handler: (agent: T2000, args: Record<string, unknown>) => Promise<unknown>;
  stateChanging: boolean;
}

const investAssets = Object.keys(INVESTMENT_ASSETS) as [string, ...string[]];

export function createToolRegistry(): GatewayTool[] {
  return [
    // ── Read tools ──
    {
      name: 't2000_balance',
      description: "Get agent's current balance — available (checking), savings, credit (debt), gas reserve, and net total. All values in USD.",
      schema: z.object({}),
      handler: async (agent) => agent.balance(),
      stateChanging: false,
    },
    {
      name: 't2000_address',
      description: "Get the agent's Sui wallet address.",
      schema: z.object({}),
      handler: async (agent) => ({ address: agent.address() }),
      stateChanging: false,
    },
    {
      name: 't2000_positions',
      description: 'View current lending positions across protocols (NAVI, Suilend) — deposits, borrows, APYs.',
      schema: z.object({}),
      handler: async (agent) => agent.positions(),
      stateChanging: false,
    },
    {
      name: 't2000_rates',
      description: 'Get best available interest rates per asset across all lending protocols.',
      schema: z.object({}),
      handler: async (agent) => agent.rates(),
      stateChanging: false,
    },
    {
      name: 't2000_health',
      description: "Check the agent's health factor — measures how safe current borrows are. Below 1.0 risks liquidation.",
      schema: z.object({}),
      handler: async (agent) => agent.healthFactor(),
      stateChanging: false,
    },
    {
      name: 't2000_history',
      description: 'View recent transactions (sends, saves, borrows, swaps, etc.).',
      schema: z.object({
        limit: z.number().optional().describe('Number of transactions to return (default: 20)'),
      }),
      handler: async (agent, args) => agent.history({ limit: args.limit as number | undefined }),
      stateChanging: false,
    },
    {
      name: 't2000_earnings',
      description: 'View yield earnings from savings positions — total earned, daily rate, current APY.',
      schema: z.object({}),
      handler: async (agent) => agent.earnings(),
      stateChanging: false,
    },
    {
      name: 't2000_contacts',
      description: 'List saved contacts (name → address mappings).',
      schema: z.object({}),
      handler: async (agent) => ({ contacts: agent.contacts.list() }),
      stateChanging: false,
    },
    {
      name: 't2000_portfolio',
      description: 'Show investment portfolio — positions, cost basis, current value, unrealized/realized P&L.',
      schema: z.object({}),
      handler: async (agent) => agent.getPortfolio(),
      stateChanging: false,
    },

    // ── Write tools ──
    {
      name: 't2000_send',
      description: 'Send USDC or stablecoins to a Sui address or contact name. Amount is in dollars.',
      schema: z.object({
        to: z.string().describe("Recipient Sui address (0x...) or contact name"),
        amount: z.number().describe('Amount in dollars to send'),
        asset: z.string().optional().describe('Asset to send (default: USDC)'),
      }),
      handler: async (agent, args) => agent.send({
        to: args.to as string,
        amount: args.amount as number,
        asset: args.asset as string | undefined,
      }),
      stateChanging: true,
    },
    {
      name: 't2000_save',
      description: 'Deposit USDC to savings (earns yield). Amount is in dollars. Use "all" to save entire available balance.',
      schema: z.object({
        amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to save, or "all"'),
      }),
      handler: async (agent, args) => agent.save({ amount: args.amount as number | 'all' }),
      stateChanging: true,
    },
    {
      name: 't2000_withdraw',
      description: 'Withdraw from savings back to checking. Amount is in dollars. Use "all" to withdraw everything.',
      schema: z.object({
        amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to withdraw, or "all"'),
      }),
      handler: async (agent, args) => agent.withdraw({ amount: args.amount as number | 'all' }),
      stateChanging: true,
    },
    {
      name: 't2000_borrow',
      description: 'Borrow USDC against savings collateral. Check health factor first — below 1.0 risks liquidation.',
      schema: z.object({
        amount: z.number().describe('Dollar amount to borrow'),
      }),
      handler: async (agent, args) => agent.borrow({ amount: args.amount as number }),
      stateChanging: true,
    },
    {
      name: 't2000_repay',
      description: 'Repay borrowed USDC. Use "all" to repay entire debt.',
      schema: z.object({
        amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to repay, or "all"'),
      }),
      handler: async (agent, args) => agent.repay({ amount: args.amount as number | 'all' }),
      stateChanging: true,
    },
    {
      name: 't2000_exchange',
      description: 'Swap assets via Cetus DEX (e.g. USDC to SUI, SUI to USDC). Amount is in source asset units.',
      schema: z.object({
        amount: z.number().describe('Amount to swap (in source asset units)'),
        from: z.string().describe('Source asset (e.g. USDC, SUI)'),
        to: z.string().describe('Target asset (e.g. SUI, USDC)'),
        maxSlippage: z.number().optional().describe('Max slippage percentage (default: 3%)'),
      }),
      handler: async (agent, args) => agent.exchange({
        from: args.from as string,
        to: args.to as string,
        amount: args.amount as number,
        maxSlippage: args.maxSlippage as number | undefined,
      }),
      stateChanging: true,
    },
    {
      name: 't2000_invest',
      description: 'Buy, sell, earn yield, or stop earning on investment assets. Actions: buy (invest USD), sell (convert to USDC), earn (deposit into lending for yield), unearn (withdraw from lending).',
      schema: z.object({
        action: z.enum(['buy', 'sell', 'earn', 'unearn']).describe("Action to perform"),
        asset: z.enum(investAssets).describe('Asset to invest in'),
        amount: z.union([z.number(), z.literal('all')]).optional().describe('USD amount (required for buy/sell)'),
        slippage: z.number().optional().describe('Max slippage percent (default: 3)'),
      }),
      handler: async (agent, args) => {
        const action = args.action as string;
        const asset = args.asset as InvestmentAsset;
        const maxSlippage = args.slippage ? (args.slippage as number) / 100 : undefined;

        if (action === 'buy') {
          return agent.investBuy({ asset, usdAmount: args.amount as number, maxSlippage });
        } else if (action === 'sell') {
          const usdAmount = args.amount === 'all' ? 'all' as const : args.amount as number;
          return agent.investSell({ asset, usdAmount, maxSlippage });
        } else if (action === 'earn') {
          return agent.investEarn({ asset });
        } else {
          return agent.investUnearn({ asset });
        }
      },
      stateChanging: true,
    },
    {
      name: 't2000_invest_rebalance',
      description: 'Move earning investment positions to better-rate protocols.',
      schema: z.object({
        minYieldDiff: z.number().optional().describe('Minimum APY difference to trigger a move (default: 0.1)'),
      }),
      handler: async (agent, args) => agent.investRebalance({
        dryRun: false,
        minYieldDiff: args.minYieldDiff as number | undefined,
      }),
      stateChanging: true,
    },
    {
      name: 't2000_strategy',
      description: 'Manage investment strategies — buy into allocations, sell, check status, rebalance, or create/delete.',
      schema: z.object({
        action: z.enum(['list', 'buy', 'sell', 'status', 'rebalance', 'create', 'delete']).describe("Strategy action"),
        name: z.string().optional().describe("Strategy name (required except for 'list')"),
        amount: z.number().optional().describe("USD amount (for 'buy')"),
        allocations: z.record(z.number()).optional().describe("Allocation map (for 'create')"),
        description: z.string().optional().describe("Description (for 'create')"),
      }),
      handler: async (agent, args) => {
        const action = args.action as string;
        const name = args.name as string;

        switch (action) {
          case 'list': return agent.strategies.getAll();
          case 'buy': return agent.investStrategy({ strategy: name, usdAmount: args.amount as number });
          case 'sell': return agent.sellStrategy({ strategy: name });
          case 'status': return agent.getStrategyStatus(name);
          case 'rebalance': return agent.rebalanceStrategy({ strategy: name });
          case 'create': return agent.strategies.create({
            name, allocations: args.allocations as Record<string, number>, description: args.description as string,
          });
          case 'delete': { agent.strategies.delete(name); return { deleted: name }; }
          default: throw new Error(`Unknown strategy action: ${action}`);
        }
      },
      stateChanging: true,
    },
    {
      name: 't2000_auto_invest',
      description: 'Dollar-cost averaging (DCA) — set up recurring purchases. Actions: setup, status, run, stop.',
      schema: z.object({
        action: z.enum(['setup', 'status', 'run', 'stop']).describe("Auto-invest action"),
        amount: z.number().optional().describe("USD amount per purchase (for 'setup')"),
        frequency: z.enum(['daily', 'weekly', 'monthly']).optional().describe("Frequency (for 'setup')"),
        strategy: z.string().optional().describe("Strategy name (for 'setup')"),
        asset: z.string().optional().describe("Single asset (for 'setup')"),
        scheduleId: z.string().optional().describe("Schedule ID (for 'stop')"),
      }),
      handler: async (agent, args) => {
        switch (args.action as string) {
          case 'setup': return agent.setupAutoInvest({
            amount: args.amount as number, frequency: args.frequency as 'daily' | 'weekly' | 'monthly',
            strategy: args.strategy as string | undefined, asset: args.asset as string | undefined,
          });
          case 'status': return agent.getAutoInvestStatus();
          case 'run': return agent.runAutoInvest();
          case 'stop': { agent.stopAutoInvest(args.scheduleId as string); return { stopped: args.scheduleId }; }
          default: throw new Error(`Unknown auto-invest action: ${args.action}`);
        }
      },
      stateChanging: true,
    },
    {
      name: 't2000_rebalance',
      description: 'Optimize savings yield by moving funds to the highest-rate protocol.',
      schema: z.object({
        minYieldDiff: z.number().optional().describe('Min APY difference to rebalance (default: 0.5%)'),
        maxBreakEven: z.number().optional().describe('Max break-even days (default: 30)'),
      }),
      handler: async (agent, args) => agent.rebalance({
        dryRun: false,
        minYieldDiff: args.minYieldDiff as number | undefined,
        maxBreakEven: args.maxBreakEven as number | undefined,
      }),
      stateChanging: true,
    },
    {
      name: 't2000_claim_rewards',
      description: 'Claim pending protocol rewards from lending positions and auto-convert to USDC.',
      schema: z.object({}),
      handler: async (agent) => agent.claimRewards(),
      stateChanging: true,
    },

    // ── Safety tools ──
    {
      name: 't2000_config',
      description: 'View or set agent safeguard limits. Use action "show" to view, "set" to update.',
      schema: z.object({
        action: z.enum(['show', 'set']).describe('"show" or "set"'),
        key: z.string().optional().describe('Setting: "maxPerTx" or "maxDailySend"'),
        value: z.number().optional().describe('New value in dollars'),
      }),
      handler: async (agent, args) => {
        if ((args.action as string) === 'show') {
          return agent.enforcer.getConfig();
        }
        const key = args.key as 'maxPerTx' | 'maxDailySend';
        agent.enforcer.set(key, args.value as number);
        return { updated: true, key, value: args.value };
      },
      stateChanging: false,
    },
    {
      name: 't2000_lock',
      description: 'Freeze all agent operations immediately. Emergency stop.',
      schema: z.object({}),
      handler: async (agent) => {
        agent.enforcer.lock();
        return { locked: true, message: 'Agent locked.' };
      },
      stateChanging: false,
    },
  ];
}

export function toolsToLLMFormat(tools: GatewayTool[]): ToolDefinition[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema, { target: 'openApi3' }) as Record<string, unknown>,
  }));
}

export function getDryRunHandler(tool: GatewayTool): ((agent: T2000, args: Record<string, unknown>) => Promise<unknown>) | null {
  if (!tool.stateChanging) return null;

  const dryRunHandlers: Record<string, (agent: T2000, args: Record<string, unknown>) => Promise<unknown>> = {
    t2000_send: async (agent, args) => {
      const resolved = agent.contacts.resolve(args.to as string);
      agent.enforcer.check({ operation: 'send', amount: args.amount as number });
      const balance = await agent.balance();
      const config = agent.enforcer.getConfig();
      return {
        preview: true, amount: args.amount, to: resolved.address,
        contactName: resolved.contactName, asset: args.asset ?? 'USDC',
        currentBalance: balance.available, balanceAfter: balance.available - (args.amount as number),
        safeguards: { dailyUsedAfter: config.dailyUsed + (args.amount as number), dailyLimit: config.maxDailySend },
      };
    },
    t2000_save: async (agent, args) => {
      agent.enforcer.assertNotLocked();
      const balance = await agent.balance();
      const rates = await agent.rates();
      const saveAmount = args.amount === 'all' ? balance.available - 1.0 : args.amount as number;
      return {
        preview: true, amount: saveAmount,
        currentApy: rates.USDC?.saveApy ?? 0,
        savingsBalanceAfter: balance.savings + saveAmount,
      };
    },
    t2000_withdraw: async (agent, args) => {
      agent.enforcer.assertNotLocked();
      const positions = await agent.positions();
      const health = await agent.healthFactor();
      const savings = positions.positions.filter((p: { type: string }) => p.type === 'save').reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      return {
        preview: true,
        amount: args.amount === 'all' ? savings : args.amount,
        currentSavings: savings, currentHealthFactor: health.healthFactor,
      };
    },
    t2000_borrow: async (agent, args) => {
      agent.enforcer.assertNotLocked();
      const health = await agent.healthFactor();
      const maxBorrow = await agent.maxBorrow();
      return {
        preview: true, amount: args.amount,
        maxBorrow: maxBorrow.maxAmount, currentHealthFactor: health.healthFactor,
        estimatedHealthFactorAfter: maxBorrow.healthFactorAfter,
      };
    },
    t2000_repay: async (agent, args) => {
      agent.enforcer.assertNotLocked();
      const health = await agent.healthFactor();
      const positions = await agent.positions();
      const totalDebt = positions.positions.filter((p: { type: string }) => p.type === 'borrow').reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      return {
        preview: true,
        amount: args.amount === 'all' ? totalDebt : args.amount,
        currentDebt: totalDebt, currentHealthFactor: health.healthFactor,
      };
    },
    t2000_exchange: async (agent, args) => {
      agent.enforcer.assertNotLocked();
      const quote = await agent.exchangeQuote({ from: args.from as string, to: args.to as string, amount: args.amount as number });
      return {
        preview: true, from: args.from, to: args.to, amount: args.amount,
        expectedOutput: quote.expectedOutput, priceImpact: quote.priceImpact, fee: quote.fee.amount,
      };
    },
    t2000_invest: async (agent, args) => {
      agent.enforcer.assertNotLocked();
      const balance = await agent.balance();
      const portfolio = await agent.getPortfolio();
      const position = portfolio.positions.find((p: { asset: string }) => p.asset === args.asset);
      return {
        preview: true, action: args.action, asset: args.asset,
        amount: args.amount === 'all' ? position?.currentValue ?? 0 : args.amount ?? position?.totalAmount ?? 0,
        currentBalance: balance.available, currentPosition: position ?? null,
        earning: position?.earning ?? false, earningProtocol: position?.earningProtocol ?? null,
        earningApy: position?.earningApy ?? null,
      };
    },
    t2000_invest_rebalance: async (agent, args) => {
      return agent.investRebalance({ dryRun: true, minYieldDiff: args.minYieldDiff as number | undefined });
    },
    t2000_rebalance: async (agent, args) => {
      return agent.rebalance({
        dryRun: true,
        minYieldDiff: args.minYieldDiff as number | undefined,
        maxBreakEven: args.maxBreakEven as number | undefined,
      });
    },
    t2000_strategy: async (agent, args) => {
      if (args.action === 'buy') {
        return agent.investStrategy({ strategy: args.name as string, usdAmount: args.amount as number, dryRun: true });
      }
      return null;
    },
    t2000_claim_rewards: async (agent) => {
      const positions = await agent.positions();
      return { preview: true, message: 'Will claim rewards from all lending positions', positionCount: positions.positions.length };
    },
  };

  return dryRunHandlers[tool.name] ?? null;
}
