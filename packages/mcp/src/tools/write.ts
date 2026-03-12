import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { T2000 } from '@t2000/sdk';
import { INVESTMENT_ASSETS } from '@t2000/sdk';
import type { InvestmentAsset } from '@t2000/sdk';
import { TxMutex } from '../mutex.js';
import { errorResult } from '../errors.js';

export function registerWriteTools(server: McpServer, agent: T2000): void {
  const mutex = new TxMutex();

  server.tool(
    't2000_send',
    'Send USDC or stablecoins to a Sui address or contact name. Amount is in dollars. Subject to per-transaction and daily send limits. Set dryRun: true to preview without signing.',
    {
      to: z.string().describe("Recipient Sui address (0x...) or contact name (e.g. 'Tom')"),
      amount: z.number().describe('Amount in dollars to send'),
      asset: z.string().optional().describe('Asset to send (default: USDC)'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ to, amount, asset, dryRun }) => {
      try {
        const resolved = agent.contacts.resolve(to);

        if (dryRun) {
          agent.enforcer.check({ operation: 'send', amount });
          const balance = await agent.balance();
          const config = agent.enforcer.getConfig();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                canSend: balance.available >= amount,
                amount,
                to: resolved.address,
                contactName: resolved.contactName,
                asset: asset ?? 'USDC',
                currentBalance: balance.available,
                balanceAfter: balance.available - amount,
                safeguards: {
                  dailyUsedAfter: config.dailyUsed + amount,
                  dailyLimit: config.maxDailySend,
                },
              }),
            }],
          };
        }

        const result = await mutex.run(() => agent.send({ to, amount, asset }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_save',
    'Deposit USDC to savings (earns yield). Amount is in dollars. Use "all" to save entire available balance. Set dryRun: true to preview.',
    {
      amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to save, or "all"'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ amount, dryRun }) => {
      try {
        if (dryRun) {
          agent.enforcer.assertNotLocked();
          const balance = await agent.balance();
          const rates = await agent.rates();
          const saveAmount = amount === 'all' ? balance.available - 1.0 : amount;

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                amount: saveAmount,
                currentApy: rates.USDC?.saveApy ?? 0,
                savingsBalanceAfter: balance.savings + saveAmount,
              }),
            }],
          };
        }

        const result = await mutex.run(() => agent.save({ amount }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_withdraw',
    'Withdraw from savings back to checking. Amount is in dollars. Use "all" to withdraw everything. Set dryRun: true to preview.',
    {
      amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to withdraw, or "all"'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ amount, dryRun }) => {
      try {
        if (dryRun) {
          agent.enforcer.assertNotLocked();
          const positions = await agent.positions();
          const health = await agent.healthFactor();
          const savings = positions.positions
            .filter(p => p.type === 'save')
            .reduce((sum, p) => sum + p.amount, 0);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                amount: amount === 'all' ? savings : amount,
                currentSavings: savings,
                currentHealthFactor: health.healthFactor,
              }),
            }],
          };
        }

        const result = await mutex.run(() => agent.withdraw({ amount }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_borrow',
    'Borrow USDC against savings collateral. Check health factor first — below 1.0 risks liquidation. Amount is in dollars. Set dryRun: true to preview.',
    {
      amount: z.number().describe('Dollar amount to borrow'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ amount, dryRun }) => {
      try {
        if (dryRun) {
          agent.enforcer.assertNotLocked();
          const health = await agent.healthFactor();
          const maxBorrow = await agent.maxBorrow();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                amount,
                maxBorrow: maxBorrow.maxAmount,
                currentHealthFactor: health.healthFactor,
                estimatedHealthFactorAfter: maxBorrow.healthFactorAfter,
              }),
            }],
          };
        }

        const result = await mutex.run(() => agent.borrow({ amount }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_repay',
    'Repay borrowed USDC. Amount is in dollars. Use "all" to repay entire debt. Set dryRun: true to preview.',
    {
      amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to repay, or "all"'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ amount, dryRun }) => {
      try {
        if (dryRun) {
          agent.enforcer.assertNotLocked();
          const health = await agent.healthFactor();
          const positions = await agent.positions();
          const totalDebt = positions.positions
            .filter(p => p.type === 'borrow')
            .reduce((sum, p) => sum + p.amount, 0);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                amount: amount === 'all' ? totalDebt : amount,
                currentDebt: totalDebt,
                currentHealthFactor: health.healthFactor,
              }),
            }],
          };
        }

        const result = await mutex.run(() => agent.repay({ amount }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_exchange',
    'Swap assets via Cetus DEX (e.g. USDC to SUI, SUI to USDC). Amount is in source asset units. Set dryRun: true to get a quote without executing.',
    {
      amount: z.number().describe('Amount to swap (in source asset units)'),
      from: z.string().describe('Source asset (e.g. USDC, SUI)'),
      to: z.string().describe('Target asset (e.g. SUI, USDC)'),
      maxSlippage: z.number().optional().describe('Max slippage percentage (default: 3%)'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ amount, from, to, maxSlippage, dryRun }) => {
      try {
        if (dryRun) {
          agent.enforcer.assertNotLocked();
          const quote = await agent.exchangeQuote({ from, to, amount });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                from,
                to,
                amount,
                expectedOutput: quote.expectedOutput,
                priceImpact: quote.priceImpact,
                fee: quote.fee.amount,
              }),
            }],
          };
        }

        const result = await mutex.run(() =>
          agent.exchange({ from, to, amount, maxSlippage }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  const investAssets = Object.keys(INVESTMENT_ASSETS) as [string, ...string[]];
  server.tool(
    't2000_invest',
    'Buy or sell investment assets (spot). Amount is in USD. Asset is the crypto to buy/sell (e.g. SUI, BTC, ETH). Set dryRun: true to preview.',
    {
      action: z.enum(['buy', 'sell']).describe("'buy' to invest USD into asset, 'sell' to convert asset back to USDC"),
      asset: z.enum(investAssets).describe('Asset to invest in'),
      amount: z.union([z.number(), z.literal('all')]).describe('USD amount, or "all" to sell entire position'),
      slippage: z.number().optional().describe('Max slippage percent (default: 3)'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ action, asset, amount, slippage, dryRun }) => {
      try {
        if (dryRun) {
          agent.enforcer.assertNotLocked();
          const balance = await agent.balance();
          const portfolio = await agent.getPortfolio();
          const position = portfolio.positions.find(p => p.asset === asset);

          if (action === 'sell' && amount === 'all' && !position) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ preview: true, error: `No ${asset} position to sell` }) }],
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                action,
                asset,
                amount: amount === 'all' ? position?.currentValue ?? 0 : amount,
                currentBalance: balance.available,
                currentPosition: position ?? null,
              }),
            }],
          };
        }

        const maxSlippage = slippage ? slippage / 100 : undefined;
        if (action === 'buy') {
          if (typeof amount !== 'number') throw new Error('Buy amount must be a number');
          const result = await mutex.run(() => agent.investBuy({ asset: asset as InvestmentAsset, usdAmount: amount, maxSlippage }));
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } else {
          const usdAmount = amount === 'all' ? 'all' as const : amount as number;
          const result = await mutex.run(() => agent.investSell({ asset: asset as InvestmentAsset, usdAmount, maxSlippage }));
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_rebalance',
    'Optimize yield by moving funds to the highest-rate protocol. Always previews first — set dryRun: false to execute. Shows plan with expected APY gain and break-even period.',
    {
      dryRun: z.boolean().optional().describe('Preview without executing (default: true)'),
      minYieldDiff: z.number().optional().describe('Min APY difference to rebalance (default: 0.5%)'),
      maxBreakEven: z.number().optional().describe('Max break-even days (default: 30)'),
    },
    async ({ dryRun, minYieldDiff, maxBreakEven }) => {
      try {
        const result = await mutex.run(() =>
          agent.rebalance({
            dryRun: dryRun ?? true,
            minYieldDiff,
            maxBreakEven,
          }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
