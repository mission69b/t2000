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
    'Deposit USDC to savings at the best USDC rate (earns yield). Amount is in dollars. Use "all" to save entire available balance. Set dryRun: true to preview. This saves USDC as USDC — do NOT suggest swapping to other assets first. If the user later wants to chase higher yields on other assets (e.g. USDe), use t2000_rebalance AFTER saving.',
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
    'Buy, sell, earn yield, or stop earning on investment assets. Actions: buy (invest USD), sell (convert to USDC), earn (deposit into best-rate lending for yield), unearn (withdraw from lending, keep in portfolio). Amount required for buy/sell only. If checking balance is insufficient for a buy, the SDK will auto-withdraw from savings — no manual withdraw needed.',
    {
      action: z.enum(['buy', 'sell', 'earn', 'unearn']).describe("'buy' to invest, 'sell' to liquidate, 'earn' to deposit into lending for yield, 'unearn' to withdraw from lending"),
      asset: z.enum(investAssets).describe('Asset to invest in'),
      amount: z.union([z.number(), z.literal('all')]).optional().describe('USD amount (required for buy/sell, ignored for earn/unearn)'),
      slippage: z.number().optional().describe('Max slippage percent (default: 3, for buy/sell only)'),
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
                amount: amount === 'all' ? position?.currentValue ?? 0 : amount ?? position?.totalAmount ?? 0,
                currentBalance: balance.available,
                currentPosition: position ?? null,
                earning: position?.earning ?? false,
                earningProtocol: position?.earningProtocol ?? null,
                earningApy: position?.earningApy ?? null,
              }),
            }],
          };
        }

        const maxSlippage = slippage ? slippage / 100 : undefined;
        if (action === 'buy') {
          if (typeof amount !== 'number') throw new Error('Buy amount must be a number');
          const result = await mutex.run(() => agent.investBuy({ asset: asset as InvestmentAsset, usdAmount: amount, maxSlippage }));
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } else if (action === 'sell') {
          const usdAmount = amount === 'all' ? 'all' as const : amount as number;
          const result = await mutex.run(() => agent.investSell({ asset: asset as InvestmentAsset, usdAmount, maxSlippage }));
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } else if (action === 'earn') {
          const result = await mutex.run(() => agent.investEarn({ asset: asset as InvestmentAsset }));
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } else {
          const result = await mutex.run(() => agent.investUnearn({ asset: asset as InvestmentAsset }));
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_invest_rebalance',
    'Move earning investment positions to better-rate protocols. Checks all earning assets and moves any where another protocol offers a higher APY.',
    {
      dryRun: z.boolean().optional().describe('Preview moves without executing (default: false)'),
      minYieldDiff: z.number().optional().describe('Minimum APY difference to trigger a move (default: 0.1)'),
    },
    async ({ dryRun, minYieldDiff }) => {
      try {
        const result = await mutex.run(() => agent.investRebalance({ dryRun, minYieldDiff }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_strategy',
    'Manage investment strategies — buy into predefined or custom allocations, sell entire strategies, check status, rebalance, or create/delete custom strategies. IMPORTANT: Before buying, ALWAYS call with action "list" first to show the user the strategy allocations (e.g. All-Weather = 30% BTC, 20% ETH, 20% SUI, 30% GOLD), then use dryRun: true to preview estimated amounts and prices. Only execute after the user confirms. If checking balance is insufficient, the SDK will auto-withdraw from savings — no manual withdraw needed.',
    {
      action: z.enum(['list', 'buy', 'sell', 'status', 'rebalance', 'create', 'delete']).describe("Strategy action to perform"),
      name: z.string().optional().describe("Strategy name (required for all actions except 'list')"),
      amount: z.number().optional().describe("USD amount (required for 'buy')"),
      allocations: z.record(z.number()).optional().describe("Allocation map e.g. {SUI: 40, BTC: 20, ETH: 20, GOLD: 20} (for 'create')"),
      description: z.string().optional().describe("Strategy description (for 'create')"),
      dryRun: z.boolean().optional().describe("Preview without signing (for 'buy')"),
    },
    async ({ action, name, amount, allocations, description, dryRun }) => {
      try {
        if (action === 'list') {
          const all = agent.strategies.getAll();
          return { content: [{ type: 'text', text: JSON.stringify(all) }] };
        }

        if (!name) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Strategy name is required' }) }] };
        }

        switch (action) {
          case 'buy': {
            if (typeof amount !== 'number') {
              return { content: [{ type: 'text', text: JSON.stringify({ error: 'Amount is required for buy' }) }] };
            }
            const result = await mutex.run(() => agent.investStrategy({ strategy: name, usdAmount: amount, dryRun }));
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'sell': {
            const result = await mutex.run(() => agent.sellStrategy({ strategy: name }));
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'status': {
            const result = await agent.getStrategyStatus(name);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'rebalance': {
            const result = await mutex.run(() => agent.rebalanceStrategy({ strategy: name }));
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'create': {
            if (!allocations) {
              return { content: [{ type: 'text', text: JSON.stringify({ error: 'Allocations required for create' }) }] };
            }
            const def = agent.strategies.create({ name, allocations, description });
            return { content: [{ type: 'text', text: JSON.stringify(def) }] };
          }
          case 'delete': {
            agent.strategies.delete(name);
            return { content: [{ type: 'text', text: JSON.stringify({ deleted: name }) }] };
          }
          default:
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown action: ${action}` }) }] };
        }
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_auto_invest',
    'Dollar-cost averaging (DCA) — set up recurring purchases into strategies or individual assets. Actions: setup, status, run, stop.',
    {
      action: z.enum(['setup', 'status', 'run', 'stop']).describe("Auto-invest action"),
      amount: z.number().optional().describe("USD amount per purchase (for 'setup')"),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional().describe("Purchase frequency (for 'setup')"),
      strategy: z.string().optional().describe("Strategy name (for 'setup')"),
      asset: z.string().optional().describe("Single asset (for 'setup', alternative to strategy)"),
      scheduleId: z.string().optional().describe("Schedule ID (for 'stop')"),
    },
    async ({ action, amount, frequency, strategy, asset, scheduleId }) => {
      try {
        switch (action) {
          case 'setup': {
            if (!amount || !frequency) {
              return { content: [{ type: 'text', text: JSON.stringify({ error: 'Amount and frequency required for setup' }) }] };
            }
            const schedule = agent.setupAutoInvest({ amount, frequency, strategy, asset });
            return { content: [{ type: 'text', text: JSON.stringify(schedule) }] };
          }
          case 'status': {
            const status = agent.getAutoInvestStatus();
            return { content: [{ type: 'text', text: JSON.stringify(status) }] };
          }
          case 'run': {
            const result = await mutex.run(() => agent.runAutoInvest());
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'stop': {
            if (!scheduleId) {
              return { content: [{ type: 'text', text: JSON.stringify({ error: 'Schedule ID required for stop' }) }] };
            }
            agent.stopAutoInvest(scheduleId);
            return { content: [{ type: 'text', text: JSON.stringify({ stopped: scheduleId }) }] };
          }
          default:
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown action: ${action}` }) }] };
        }
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_rebalance',
    'Optimize savings yield — automatically finds the best rate across ALL assets and protocols, then handles everything: withdraw → swap → re-deposit. Works across different assets (e.g. USDC → USDe for higher APY). Always previews first — set dryRun: false to execute. Shows plan with APY gain, annual earnings increase, and break-even period. This is the ONE tool to use when the user asks "am I getting the best yield?" or "rebalance my savings".',
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

  server.tool(
    't2000_claim_rewards',
    'Claim pending protocol rewards from lending positions and auto-convert to USDC.',
    {},
    async () => {
      try {
        const result = await mutex.run(() => agent.claimRewards());
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // MPP Payments
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_pay',
    `Make a paid API request using MPP (Machine Payments Protocol). Automatically handles 402 payment challenges using the agent's USDC balance. Enforces safeguards. Returns the API response and payment receipt.

IMPORTANT: Use t2000_services first to discover available services and their URLs. All services are at https://mpp.t2000.ai/.

Common examples:
- Chat: POST https://mpp.t2000.ai/openai/v1/chat/completions {"model":"gpt-4o","messages":[...]}
- Search: POST https://mpp.t2000.ai/brave/v1/web/search {"q":"query"}
- Image: POST https://mpp.t2000.ai/fal/fal-ai/flux/dev {"prompt":"..."}
- Weather: POST https://mpp.t2000.ai/openweather/v1/weather {"q":"Tokyo"}
- Email: POST https://mpp.t2000.ai/resend/v1/emails {"from":"...","to":"...","subject":"...","text":"..."}
- Gift card: POST https://mpp.t2000.ai/reloadly/v1/order {"productId":120,"unitPrice":20,"recipientEmail":"..."}
- Postcard: POST https://mpp.t2000.ai/lob/v1/postcards {"to":{"name":"...","address_line1":"...","address_city":"...","address_state":"...","address_zip":"..."},...}
- Letter: POST https://mpp.t2000.ai/lob/v1/letters {similar to postcards}
- Code exec: POST https://mpp.t2000.ai/judge0/v1/submissions {"source_code":"...","language_id":71}`,
    {
      url: z.string().describe('Full URL of the MPP service endpoint (use t2000_services to discover available URLs)'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST').describe('HTTP method (most services use POST)'),
      body: z.string().optional().describe('JSON request body (required for POST endpoints)'),
      headers: z.record(z.string()).optional().describe('Additional HTTP headers'),
      maxPrice: z.number().default(1.0).describe('Max USD to pay (default: $1.00). Set higher for gift cards/commerce.'),
    },
    async ({ url, method, body, headers, maxPrice }) => {
      try {
        const result = await mutex.run(() =>
          agent.pay({ url, method, body, headers, maxPrice }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Sentinel
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_sentinel_attack',
    'Attack a Sui Sentinel with a prompt to try to breach its defenses and win the prize pool. Costs SUI (the attack fee). Use t2000_sentinel_list to find targets first.',
    {
      id: z.string().describe('Sentinel agent ID or object ID to attack'),
      prompt: z.string().describe('Your attack prompt — try to make the AI do something its system prompt forbids'),
      fee: z.number().optional().describe('Override attack fee in SUI (default: sentinel\'s listed fee)'),
    },
    async ({ id, prompt, fee }) => {
      try {
        const feeMist = fee ? BigInt(Math.round(fee * 1e9)) : undefined;
        const result = await mutex.run(() => agent.sentinelAttack(id, prompt, feeMist));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Contact management
  // ---------------------------------------------------------------------------

  server.tool(
    't2000_contact_add',
    'Save a contact name → Sui address mapping. After saving, use the name with t2000_send instead of pasting addresses. Example: save "Tom" as 0x1234... then send to "Tom".',
    {
      name: z.string().describe('Contact name (e.g. "Tom", "Alice")'),
      address: z.string().describe('Sui wallet address (0x...)'),
    },
    async ({ name, address }) => {
      try {
        const result = agent.contacts.add(name, address);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, name, address, ...result }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_contact_remove',
    'Remove a saved contact by name.',
    {
      name: z.string().describe('Contact name to remove'),
    },
    async ({ name }) => {
      try {
        const removed = agent.contacts.remove(name);
        return { content: [{ type: 'text', text: JSON.stringify({ success: removed, name }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
