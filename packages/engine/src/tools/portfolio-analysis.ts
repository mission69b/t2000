import { z } from 'zod';
import { buildTool } from '../tool.js';
import {
  fetchAddressPortfolio,
  type AddressPortfolio,
} from '../blockvision-prices.js';

const inputSchema = z.object({
  address: z.string().optional().describe('Sui address to analyze (defaults to connected wallet)'),
});

interface AssetAllocation {
  symbol: string;
  amount: number;
  usdValue: number;
  percentage: number;
}

interface PortfolioInsight {
  type: 'info' | 'warning' | 'suggestion';
  message: string;
}

interface WeekChange {
  absoluteUsd: number;
  percentChange: number;
}

interface PortfolioResult {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  debtValue: number;
  healthFactor: number | null;
  allocations: AssetAllocation[];
  stablePercentage: number;
  insights: PortfolioInsight[];
  savingsApy?: number;
  dailyEarning?: number;
  weekChange?: WeekChange;
  priceSource: AddressPortfolio['source'];
}

const STABLECOINS = new Set(['USDC', 'USDT', 'USDe', 'USDsui']);

export const portfolioAnalysisTool = buildTool({
  name: 'portfolio_analysis',
  description:
    'Analyze portfolio allocation, risk exposure, and yield optimization. Shows asset breakdown, diversification score, health factor assessment, and actionable suggestions.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'Sui address to analyze (defaults to connected wallet)' },
    },
    required: [],
  },
  isReadOnly: true,
  async call(input, context) {
    const address = input.address ?? context.walletAddress;
    if (!address) {
      throw new Error('No wallet address provided. Sign in first.');
    }

    const DUST_USD = 0.01;

    // [v1.4 BlockVision] Fan out three independent fetches in parallel:
    // BlockVision portfolio (coins + balances + USD prices in one shot),
    // positions (host fetcher), and 7-day portfolio history. Total wall
    // time is bound by the slowest. Re-uses the per-request portfolio
    // cache so a sibling `balance_check` in the same turn shares the
    // response.
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const [portfolio, positions, weekHistResult] = await Promise.all([
      (async () => {
        if (context.portfolioCache) {
          const hit = context.portfolioCache.get(address);
          if (hit) return hit;
        }
        const fresh = await fetchAddressPortfolio(
          address,
          context.blockvisionApiKey,
          context.suiRpcUrl,
        );
        context.portfolioCache?.set(address, fresh);
        return fresh;
      })().catch((err) => {
        console.warn('[portfolio_analysis] portfolio fetch failed:', err);
        const empty: AddressPortfolio = {
          coins: [],
          totalUsd: 0,
          pricedAt: Date.now(),
          source: 'sui-rpc-degraded',
        };
        return empty;
      }),
      context.positionFetcher
        ? context.positionFetcher(address).catch((err) => {
            console.warn('[portfolio_analysis] positionFetcher failed:', err);
            return null;
          })
        : Promise.resolve(null),
      apiUrl
        ? fetch(
            `${apiUrl}/api/analytics/portfolio-history?days=7`,
            { headers: { 'x-sui-address': address }, signal: context.signal },
          )
            .then((res) => (res.ok ? res.json() as Promise<{ change?: WeekChange }> : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    let walletValue = 0;
    const allAllocations: AssetAllocation[] = [];

    for (const coin of portfolio.coins) {
      const amount = Number(coin.balance) / 10 ** coin.decimals;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const usdValue = coin.usdValue ?? (coin.price != null ? amount * coin.price : 0);
      walletValue += usdValue;
      allAllocations.push({ symbol: coin.symbol, amount, usdValue, percentage: 0 });
    }

    const allocations = allAllocations.filter((a) => a.usdValue >= DUST_USD);

    let savingsValue = 0;
    let debtValue = 0;
    let healthFactor: number | null = null;
    let savingsApy: number | undefined;
    let dailyEarning: number | undefined;

    if (positions) {
      savingsValue = positions.savings ?? 0;
      debtValue = positions.borrows ?? 0;
      healthFactor = positions.healthFactor ?? null;
      if (typeof positions.savingsRate === 'number' && positions.savingsRate > 0) {
        savingsApy = positions.savingsRate;
        dailyEarning = savingsValue * savingsApy / 365;
      }
    }

    let weekChange: WeekChange | undefined;
    if (weekHistResult?.change && weekHistResult.change.absoluteUsd !== 0) {
      weekChange = weekHistResult.change;
    }

    const totalValue = walletValue + savingsValue;

    for (const a of allocations) {
      a.percentage = totalValue > 0 ? (a.usdValue / totalValue) * 100 : 0;
    }
    allocations.sort((a, b) => b.usdValue - a.usdValue);

    const stableValue = allocations
      .filter((a) => STABLECOINS.has(a.symbol))
      .reduce((s, a) => s + a.usdValue, 0) + savingsValue;
    const stablePercentage = totalValue > 0 ? (stableValue / totalValue) * 100 : 0;

    const insights: PortfolioInsight[] = [];

    if (healthFactor !== null && healthFactor < 1.5) {
      insights.push({
        type: 'warning',
        message: `Health factor ${healthFactor.toFixed(2)} is dangerously low. Consider repaying debt or adding collateral.`,
      });
    } else if (healthFactor !== null && healthFactor < 2.5) {
      insights.push({
        type: 'warning',
        message: `Health factor ${healthFactor.toFixed(2)} is moderate. Monitor your positions.`,
      });
    }

    if (stablePercentage > 80) {
      insights.push({
        type: 'suggestion',
        message: `${stablePercentage.toFixed(0)}% stablecoins. Consider diversifying into yield-bearing positions.`,
      });
    }

    const idleCash = allocations.find((a) => a.symbol === 'USDC');
    if (idleCash && idleCash.usdValue > 10) {
      insights.push({
        type: 'suggestion',
        message: `$${idleCash.usdValue.toFixed(2)} USDC idle in wallet. Deposit into NAVI savings for ~4-5% APY.`,
      });
    }

    if (allocations.length === 1) {
      insights.push({
        type: 'info',
        message: 'Portfolio is concentrated in a single asset.',
      });
    }

    const result: PortfolioResult = {
      totalValue,
      walletValue,
      savingsValue,
      debtValue,
      healthFactor,
      allocations: allocations.slice(0, 10),
      stablePercentage,
      insights,
      savingsApy,
      dailyEarning,
      weekChange,
      priceSource: portfolio.source,
    };

    const topLine = `Total: $${totalValue.toFixed(2)} | Wallet: $${walletValue.toFixed(2)} | Savings: $${savingsValue.toFixed(2)}`;
    const insightLines = insights.map((i) => `${i.type === 'warning' ? '⚠' : '→'} ${i.message}`).join('\n');

    return {
      data: result,
      displayText: `${topLine}\n${insightLines}`,
    };
  },
});
