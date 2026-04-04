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

interface PortfolioResult {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  debtValue: number;
  healthFactor: number | null;
  allocations: AssetAllocation[];
  stablePercentage: number;
  insights: PortfolioInsight[];
}

const STABLECOINS = new Set(['USDC', 'USDT', 'USDe', 'USDsui', 'DAI', 'BUCK']);

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

    const coins = await fetchWalletCoins(address, rpcUrl);
    const nonZero = coins.filter((c) => Number(c.totalBalance) > 0);
    const prices = await fetchTokenPrices(nonZero.map((c) => c.coinType)).catch(() => ({} as Record<string, number>));

    let walletValue = 0;
    const allocations: AssetAllocation[] = [];

    for (const coin of nonZero) {
      const amount = Number(coin.totalBalance) / 10 ** coin.decimals;
      const price = prices[coin.coinType] ?? 0;
      const usdValue = amount * price;
      walletValue += usdValue;
      allocations.push({ symbol: coin.symbol, amount, usdValue, percentage: 0 });
    }

    let savingsValue = 0;
    let debtValue = 0;
    let healthFactor: number | null = null;

    if (context.positionFetcher) {
      try {
        const positions = await context.positionFetcher(address);
        savingsValue = positions.savings ?? 0;
        debtValue = positions.borrows ?? 0;
        healthFactor = positions.healthFactor ?? null;
      } catch { /* fallback to wallet only */ }
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
    };

    const topLine = `Total: $${totalValue.toFixed(2)} | Wallet: $${walletValue.toFixed(2)} | Savings: $${savingsValue.toFixed(2)}`;
    const insightLines = insights.map((i) => `${i.type === 'warning' ? '⚠' : '→'} ${i.message}`).join('\n');

    return {
      data: result,
      displayText: `${topLine}\n${insightLines}`,
    };
  },
});
