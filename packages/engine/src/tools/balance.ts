import { z } from 'zod';
import { fetchWalletCoins } from '../sui-rpc.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';
import type { McpClientManager } from '../mcp-client.js';
import { NAVI_SERVER_NAME, NaviTools } from '../navi-config.js';
import {
  parseMcpJson,
  transformPositions,
  transformRewards,
} from '../navi-transforms.js';
import { fetchTokenPrices } from '../defillama-prices.js';

const GAS_RESERVE_SUI = 0.05;

async function callNavi<T = unknown>(
  manager: McpClientManager,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await manager.callTool(NAVI_SERVER_NAME, tool, args);
  if (result.isError) {
    const msg = result.content
      .filter((c: { type: string; text?: string }) => c.type === 'text' && c.text)
      .map((c: { type: string; text?: string }) => c.text!)
      .join(' ');
    throw new Error(`NAVI MCP error (${tool}): ${msg || 'unknown error'}`);
  }
  return parseMcpJson<T>(result.content);
}

export const balanceCheckTool = buildTool({
  name: 'balance_check',
  description:
    'Get the user\'s full balance breakdown: available USDC, savings deposits, outstanding debt, pending rewards, gas reserve, and total net worth.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (hasNaviMcp(context)) {
      const address = getWalletAddress(context);
      const mgr = getMcpManager(context);

      const [walletCoins, positions, rewards] = await Promise.all([
        fetchWalletCoins(address, context.suiRpcUrl).catch((err) => {
          console.warn('[balance_check] Sui RPC coin fetch failed, falling back to MCP:', err);
          return null;
        }),
        callNavi(mgr, NaviTools.GET_POSITIONS, {
          address,
          protocols: 'navi',
          format: 'json',
        }),
        callNavi(mgr, NaviTools.GET_AVAILABLE_REWARDS, { address }),
      ]);

      let coins = walletCoins;
      if (!coins || coins.length === 0) {
        const mcpCoins = await callNavi(mgr, NaviTools.GET_COINS, { address }).catch(() => []);
        const coinArr = Array.isArray(mcpCoins) ? mcpCoins as Array<{ coinType?: string; totalBalance?: string; symbol?: string; decimals?: number }> : [];
        coins = coinArr.map((c) => ({
          coinType: c.coinType ?? '',
          symbol: c.symbol ?? '',
          decimals: c.decimals ?? (c.symbol === 'SUI' ? 9 : 6),
          totalBalance: c.totalBalance ?? '0',
          coinObjectCount: 0,
        }));
      }

      const VSUI_COIN_TYPE = '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';
      const coinTypes = coins.map((c) => c.coinType).filter(Boolean);
      const prices = await fetchTokenPrices(coinTypes).catch((err) => {
        console.warn('[balance_check] DefiLlama price fetch failed:', err);
        return {} as Record<string, number>;
      });

      if (coins.some((c) => c.coinType === VSUI_COIN_TYPE) && !prices[VSUI_COIN_TYPE]) {
        try {
          const statsRes = await fetch('https://open-api.naviprotocol.io/api/volo/stats', {
            signal: AbortSignal.timeout(5_000),
          });
          if (statsRes.ok) {
            const statsJson = await statsRes.json() as { data?: { exchange_rate?: number; exchangeRate?: number } };
            const d = statsJson.data ?? statsJson as { exchange_rate?: number; exchangeRate?: number };
            const rate = d.exchange_rate ?? d.exchangeRate ?? 1.05;
            const suiPrice = prices['0x2::sui::SUI'] ?? 0;
            prices[VSUI_COIN_TYPE] = rate * suiPrice;
          }
        } catch {
          const suiPrice = prices['0x2::sui::SUI'] ?? 0;
          prices[VSUI_COIN_TYPE] = suiPrice * 1.05;
        }
      }

      let availableUsd = 0;
      let stablesUsd = 0;
      let gasReserveUsd = 0;

      const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'wUSDC', 'wUSDT', 'FDUSD', 'AUSD', 'BUCK']);
      const holdings: Array<{ symbol: string; coinType: string; balance: number; usdValue: number }> = [];

      for (const coin of coins) {
        const balance = Number(coin.totalBalance) / 10 ** coin.decimals;
        const price = prices[coin.coinType] ?? 0;

        if (coin.symbol === 'SUI' || coin.coinType === '0x2::sui::SUI') {
          const reserveAmount = Math.min(balance, GAS_RESERVE_SUI);
          gasReserveUsd = reserveAmount * price;
          availableUsd += (balance - reserveAmount) * price;
        } else {
          availableUsd += balance * price;
          if (STABLE_SYMBOLS.has(coin.symbol)) {
            stablesUsd += balance * price;
          }
        }

        if (balance > 0) {
          holdings.push({
            symbol: coin.symbol || coin.coinType.split('::').pop() || coin.coinType,
            coinType: coin.coinType,
            balance,
            usdValue: balance * price,
          });
        }
      }

      const posEntries = transformPositions(positions);
      const rewardEntries = transformRewards(rewards);

      const savings = posEntries
        .filter((p) => p.type === 'supply')
        .reduce((sum, p) => sum + p.valueUsd, 0);
      const debt = posEntries
        .filter((p) => p.type === 'borrow')
        .reduce((sum, p) => sum + p.valueUsd, 0);
      const pendingRewardsUsd = rewardEntries.reduce((sum, r) => sum + r.valueUsd, 0);

      const bal = {
        available: availableUsd,
        savings,
        debt,
        pendingRewards: pendingRewardsUsd,
        gasReserve: gasReserveUsd,
        total: availableUsd + savings + gasReserveUsd + pendingRewardsUsd - debt,
        stables: stablesUsd,
        holdings: holdings.sort((a, b) => b.usdValue - a.usdValue),
      };

      return {
        data: bal,
        displayText: `Balance: $${bal.total.toFixed(2)} (Available: $${bal.available.toFixed(2)}, Savings: $${bal.savings.toFixed(2)})`,
      };
    }

    const agent = requireAgent(context);
    const balance = await agent.balance();

    const gasReserveUsd = typeof balance.gasReserve === 'number'
      ? balance.gasReserve
      : (balance.gasReserve as { usdEquiv: number }).usdEquiv ?? 0;
    const stablesTotal = typeof balance.stables === 'number'
      ? balance.stables
      : Object.values(balance.stables as Record<string, number>).reduce((a: number, b: number) => a + b, 0);

    const sdkHoldings = (balance as unknown as Record<string, unknown>).holdings;
    const holdingsArr = Array.isArray(sdkHoldings) ? sdkHoldings : [];

    return {
      data: {
        available: balance.available,
        savings: balance.savings,
        debt: balance.debt,
        pendingRewards: balance.pendingRewards,
        gasReserve: gasReserveUsd,
        total: balance.total,
        stables: stablesTotal,
        holdings: holdingsArr,
      },
      displayText: `Balance: $${balance.total.toFixed(2)} (Available: $${balance.available.toFixed(2)}, Savings: $${balance.savings.toFixed(2)})`,
    };
  },
});
