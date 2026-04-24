import { z } from 'zod';
import { buildTool } from '../tool.js';
import { fetchWalletCoins } from '../sui-rpc.js';
import { fetchTokenPrices } from '../defillama-prices.js';

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

    const rpcUrl = context.suiRpcUrl ?? 'https://fullnode.mainnet.sui.io:443';

    const DUST_USD = 0.01;

    // [v0.47] Fan out three independent fetches in parallel: wallet coins
    // (Sui RPC), positions (host fetcher), and 7-day portfolio history
    // (Audric internal API). Was previously a serial chain costing the sum
    // of all three; now bound by the slowest. Prices still chain after
    // coins because they need the resolved coin types.
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const [coins, positions, weekHistResult] = await Promise.all([
      fetchWalletCoins(address, rpcUrl),
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

    const nonZero = coins.filter((c) => Number(c.totalBalance) > 0);
    const prices = await fetchTokenPrices(nonZero.map((c) => c.coinType)).catch(() => ({} as Record<string, number>));

    let walletValue = 0;
    const allAllocations: AssetAllocation[] = [];

    for (const coin of nonZero) {
      const amount = Number(coin.totalBalance) / 10 ** coin.decimals;
      const price = prices[coin.coinType] ?? 0;
      const usdValue = amount * price;
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
    };

    const topLine = `Total: $${totalValue.toFixed(2)} | Wallet: $${walletValue.toFixed(2)} | Savings: $${savingsValue.toFixed(2)}`;
    const insightLines = insights.map((i) => `${i.type === 'warning' ? '⚠' : '→'} ${i.message}`).join('\n');

    return {
      data: result,
      displayText: `${topLine}\n${insightLines}`,
    };
  },
});
