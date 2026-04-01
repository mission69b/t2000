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
  transformRates,
} from '../navi-transforms.js';

const STABLECOIN_SYMBOLS = new Set([
  'USDC', 'USDT', 'wUSDC', 'wUSDT', 'FDUSD', 'AUSD', 'BUCK', 'suiUSDe', 'USDSUI',
]);

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

      const [walletCoins, positions, rewards, pools] = await Promise.all([
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
        callNavi(mgr, NaviTools.GET_POOLS, {}),
      ]);

      const rates = transformRates(pools);
      const prices: Record<string, number> = {};
      for (const [symbol, rate] of Object.entries(rates)) {
        prices[symbol] = rate.price;
      }

      let availableUsd = 0;
      let stablesUsd = 0;
      let gasReserveUsd = 0;

      if (walletCoins && walletCoins.length > 0) {
        for (const coin of walletCoins) {
          const balance = Number(coin.totalBalance) / 10 ** coin.decimals;
          const price = prices[coin.symbol] ?? (STABLECOIN_SYMBOLS.has(coin.symbol) ? 1 : 0);

          if (coin.symbol === 'SUI' || coin.coinType === '0x2::sui::SUI') {
            const reserveAmount = Math.min(balance, GAS_RESERVE_SUI);
            gasReserveUsd = reserveAmount * price;
            availableUsd += (balance - reserveAmount) * price;
          } else {
            availableUsd += balance * price;
            if (STABLECOIN_SYMBOLS.has(coin.symbol)) {
              stablesUsd += balance * price;
            }
          }
        }
      } else {
        const mcpCoins = await callNavi(mgr, NaviTools.GET_COINS, { address }).catch(() => []);
        const coinArr = Array.isArray(mcpCoins) ? mcpCoins as Array<{ coinType?: string; totalBalance?: string; symbol?: string; decimals?: number }> : [];
        for (const c of coinArr) {
          const symbol = c.symbol ?? '';
          const decimals = c.decimals ?? (symbol === 'SUI' ? 9 : 6);
          const balance = Number(c.totalBalance ?? '0') / 10 ** decimals;
          const price = prices[symbol] ?? (STABLECOIN_SYMBOLS.has(symbol) ? 1 : 0);

          if (symbol === 'SUI' || c.coinType === '0x2::sui::SUI') {
            const reserveAmount = Math.min(balance, GAS_RESERVE_SUI);
            gasReserveUsd = reserveAmount * price;
            availableUsd += (balance - reserveAmount) * price;
          } else {
            availableUsd += balance * price;
            if (STABLECOIN_SYMBOLS.has(symbol)) {
              stablesUsd += balance * price;
            }
          }
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

    return {
      data: {
        available: balance.available,
        savings: balance.savings,
        debt: balance.debt,
        pendingRewards: balance.pendingRewards,
        gasReserve: gasReserveUsd,
        total: balance.total,
        stables: stablesTotal,
      },
      displayText: `Balance: $${balance.total.toFixed(2)} (Available: $${balance.available.toFixed(2)}, Savings: $${balance.savings.toFixed(2)})`,
    };
  },
});
