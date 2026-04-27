import { z } from 'zod';
import { buildTool } from '../tool.js';
import { hasNaviMcpGlobal, getMcpManager, requireAgent } from './utils.js';
import type { McpClientManager } from '../mcp-client.js';
import { NAVI_SERVER_NAME, NaviTools } from '../navi-config.js';
import {
  parseMcpJson,
  transformPositions,
  transformRewards,
} from '../navi-transforms.js';
import {
  fetchAddressPortfolio,
  type AddressPortfolio,
} from '../blockvision-prices.js';

const GAS_RESERVE_SUI = 0.05;

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{1,64}$/;

// vSUI (Volo's liquid-staked SUI). BlockVision sometimes lacks a price for
// this token — when missing we read the official Volo exchange rate and
// derive vSUI = rate × SUI price. See [v1.4.1 — M1'] for the rewrite that
// mutates the portfolio in place.
const VSUI_COIN_TYPE =
  '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';
const SUI_COIN_TYPE = '0x2::sui::SUI';
const VSUI_FALLBACK_RATE = 1.05;

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

/**
 * [v1.4.1 — M1'] Mutates `portfolio` in place to fill in the vSUI USD
 * price/value when BlockVision returned no price for it. Reads the
 * canonical exchange rate from Volo's public stats endpoint and falls
 * back to a hardcoded 1.05× SUI multiplier if the call fails.
 *
 * No-op when the wallet doesn't hold vSUI or BlockVision already returned
 * a price.
 */
async function applyVsuiPriceFallback(portfolio: AddressPortfolio): Promise<void> {
  const vsuiIdx = portfolio.coins.findIndex((c) => c.coinType === VSUI_COIN_TYPE);
  if (vsuiIdx === -1) return;
  const vsui = portfolio.coins[vsuiIdx];
  if (vsui.price != null) return;

  const suiCoin = portfolio.coins.find((c) => c.coinType === SUI_COIN_TYPE);
  const suiPrice = suiCoin?.price ?? null;
  if (suiPrice == null) return;

  let rate = VSUI_FALLBACK_RATE;
  try {
    const statsRes = await fetch('https://open-api.naviprotocol.io/api/volo/stats', {
      signal: AbortSignal.timeout(5_000),
    });
    if (statsRes.ok) {
      const json = (await statsRes.json()) as {
        data?: { exchange_rate?: number; exchangeRate?: number };
        exchange_rate?: number;
        exchangeRate?: number;
      };
      const data = json.data ?? json;
      rate = data.exchange_rate ?? data.exchangeRate ?? VSUI_FALLBACK_RATE;
    }
  } catch {
    // Network error — keep the hardcoded fallback rate.
  }

  const price = rate * suiPrice;
  const amount = Number(vsui.balance) / 10 ** vsui.decimals;
  const usdValue = Number.isFinite(amount) ? amount * price : null;
  const previousUsd = vsui.usdValue ?? 0;
  portfolio.coins[vsuiIdx] = { ...vsui, price, usdValue };
  if (usdValue != null) {
    portfolio.totalUsd = portfolio.totalUsd - previousUsd + usdValue;
  }
}

async function loadPortfolio(
  address: string,
  blockvisionApiKey: string | undefined,
  fallbackRpcUrl: string | undefined,
  cache: Map<string, AddressPortfolio> | undefined,
): Promise<AddressPortfolio> {
  if (cache) {
    const hit = cache.get(address);
    if (hit) return hit;
  }
  const portfolio = await fetchAddressPortfolio(address, blockvisionApiKey, fallbackRpcUrl);
  if (cache) cache.set(address, portfolio);
  return portfolio;
}

export const balanceCheckTool = buildTool({
  name: 'balance_check',
  description:
    'Get the full balance breakdown for the signed-in user OR any public Sui address. Returns wallet holdings (tokens the address owns — NOT savings), NAVI savings deposits (USDC deposited into NAVI Protocol earning yield), outstanding debt, pending rewards, gas reserve, total net worth, and saveableUsdc (only USDC can be deposited into savings). IMPORTANT: wallet holdings like GOLD, SUI, USDT are NOT savings positions — they are just tokens sitting in the wallet. Pass `address` to inspect a contact / watched / public wallet; defaults to the signed-in user when omitted.',
  inputSchema: z.object({
    address: z
      .string()
      .regex(SUI_ADDRESS_REGEX)
      .optional()
      .describe('Sui address to inspect (defaults to the signed-in wallet)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        pattern: '^0x[a-fA-F0-9]{1,64}$',
        description: 'Sui address to inspect (defaults to the signed-in wallet)',
      },
    },
    required: [],
  },
  isReadOnly: true,
  // [v1.4 BlockVision] Wallet contents change after every send / swap /
  // save / etc. and the price half of this result is sourced from
  // BlockVision's Indexer REST API. Microcompact must NEVER dedupe these
  // calls — each one reflects a different on-chain + market snapshot.
  cacheable: false,

  async call(input, context) {
    /**
     * [v0.49] Address-scope: tool now accepts an optional `address` param
     * so the LLM can inspect any public Sui wallet (contacts, watched
     * addresses, etc.). Pre-v0.49 the tool only ever queried
     * `context.walletAddress`, which masked any contact-balance question
     * by silently returning the signed-in user's data instead. Falls back
     * to `context.walletAddress` when the param is absent. Stamps
     * `address` + `isSelfQuery` on the result so the UI can title cards
     * appropriately when rendering a non-self balance.
     *
     * The host-provided `positionFetcher(address)` takes an address
     * argument and works for any wallet, so savings / debt / rewards
     * automatically scope correctly. Empty wallets and unknown addresses
     * surface honestly (zero balance) rather than failing.
     */
    const targetAddress = input.address ?? context.walletAddress;
    const isSelfQuery =
      !!context.walletAddress &&
      !!targetAddress &&
      targetAddress.toLowerCase() === context.walletAddress.toLowerCase();

    if (hasNaviMcpGlobal(context)) {
      if (!targetAddress) {
        throw new Error('No wallet address provided. Sign in or pass `address` to inspect a public wallet.');
      }
      const address = targetAddress;
      const mgr = getMcpManager(context);

      // [v0.47] When a host-side `positionFetcher` is configured (Audric
      // production), savings/debt/rewards come from the host instead of
      // NAVI MCP. Skip those MCP calls entirely — they were previously
      // fetched in parallel and then discarded.
      const hasPositionFetcher = !!context.positionFetcher;

      // [v1.4 BlockVision] Single BlockVision call returns coins +
      // balances + prices in one shot, replacing the parallel
      // (Sui RPC fetchWalletCoins + DefiLlama fetchTokenPrices) pair.
      // Run alongside positions / rewards / positionFetcher so total
      // wall time is bound by the slowest of the four.
      const [portfolio, positions, rewards, serverPositions] = await Promise.all([
        loadPortfolio(
          address,
          context.blockvisionApiKey,
          context.suiRpcUrl,
          context.portfolioCache,
        ).catch((err) => {
          console.warn('[balance_check] portfolio fetch failed, returning empty:', err);
          const fallback: AddressPortfolio = {
            coins: [],
            totalUsd: 0,
            pricedAt: Date.now(),
            source: 'sui-rpc-degraded',
          };
          return fallback;
        }),
        hasPositionFetcher
          ? Promise.resolve(null)
          : callNavi(mgr, NaviTools.GET_POSITIONS, {
              address,
              protocols: 'navi',
              format: 'json',
            }).catch((err) => {
              console.warn('[balance_check] NAVI GET_POSITIONS failed:', err);
              return null;
            }),
        hasPositionFetcher
          ? Promise.resolve(null)
          : callNavi(mgr, NaviTools.GET_AVAILABLE_REWARDS, { address }).catch((err) => {
              console.warn('[balance_check] NAVI GET_AVAILABLE_REWARDS failed:', err);
              return null;
            }),
        hasPositionFetcher
          ? context.positionFetcher!(address).catch((err) => {
              console.warn('[balance_check] positionFetcher failed:', err);
              return null;
            })
          : Promise.resolve(null),
      ]);

      // [v1.4.1 — M1'] vSUI workaround mutates the portfolio in place
      // (BlockVision occasionally lacks a price for vSUI; we derive it
      // from the SUI price + Volo exchange rate). No-op when the wallet
      // doesn't hold vSUI.
      await applyVsuiPriceFallback(portfolio);

      // [v1.4.1 — M2'] NAVI MCP `GET_COINS` fallback removed. Previously
      // when Sui RPC returned an empty coin list we'd hit NAVI as a
      // tertiary source; with BlockVision as the primary and Sui RPC
      // already serving as the degraded fallback inside
      // `fetchAddressPortfolio`, the third tier added complexity without
      // real coverage (NAVI's coin endpoint shares infrastructure with
      // its already-failing positions endpoint). An empty wallet now
      // surfaces honestly to the user rather than silently swapping
      // sources mid-render.

      let availableUsd = 0;
      let stablesUsd = 0;
      let gasReserveUsd = 0;

      const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'USDe', 'USDsui', 'wUSDC', 'wUSDT']);
      const holdings: Array<{ symbol: string; coinType: string; balance: number; usdValue: number }> = [];

      for (const coin of portfolio.coins) {
        const balance = Number(coin.balance) / 10 ** coin.decimals;
        const price = coin.price ?? 0;

        if (coin.symbol === 'SUI' || coin.coinType === SUI_COIN_TYPE) {
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

      let savings: number;
      let debt: number;
      let pendingRewardsUsd: number;

      if (serverPositions) {
        savings = serverPositions.savings;
        debt = serverPositions.borrows;
        pendingRewardsUsd = serverPositions.pendingRewards;
      } else {
        const posEntries = transformPositions(positions);
        const rewardEntries = transformRewards(rewards);
        savings = posEntries
          .filter((p) => p.type === 'supply')
          .reduce((sum, p) => sum + p.valueUsd, 0);
        debt = posEntries
          .filter((p) => p.type === 'borrow')
          .reduce((sum, p) => sum + p.valueUsd, 0);
        pendingRewardsUsd = rewardEntries.reduce((sum, r) => sum + r.valueUsd, 0);
      }

      const visibleHoldings = holdings
        .filter((h) => h.usdValue >= 0.01)
        .sort((a, b) => b.usdValue - a.usdValue);

      const usdcHolding = holdings.find((h) => h.symbol === 'USDC');
      const saveableUsdc = usdcHolding ? usdcHolding.balance : 0;

      const bal = {
        available: availableUsd,
        savings,
        debt,
        pendingRewards: pendingRewardsUsd,
        gasReserve: gasReserveUsd,
        total: availableUsd + savings + gasReserveUsd + pendingRewardsUsd - debt,
        stables: stablesUsd,
        holdings: visibleHoldings,
        saveableUsdc,
        priceSource: portfolio.source,
        address,
        isSelfQuery,
      };

      const holdingsList = visibleHoldings.map((h) => `${h.symbol}: ${h.balance < 1 ? h.balance.toFixed(6) : h.balance.toFixed(2)} ($${h.usdValue.toFixed(2)})`).join(', ');
      const subjectPrefix = isSelfQuery
        ? 'Balance'
        : `Balance for ${address.slice(0, 6)}…${address.slice(-4)}`;
      return {
        data: bal,
        displayText: `${subjectPrefix}: $${bal.total.toFixed(2)} total. Wallet holdings (NOT savings): ${holdingsList || 'none'}. NAVI savings deposits: $${bal.savings.toFixed(2)}. Saveable USDC (only USDC can be saved): ${saveableUsdc.toFixed(2)} USDC.`,
      };
    }

    // SDK agent fallback — only meaningful for the signed-in user (the
    // SDK's `balance()` method is bound to the agent's own wallet). If
    // the LLM passed a different address, refuse rather than silently
    // returning the agent's own balance.
    if (
      input.address &&
      context.walletAddress &&
      input.address.toLowerCase() !== context.walletAddress.toLowerCase()
    ) {
      throw new Error(
        `Cannot inspect ${input.address.slice(0, 8)}… without NAVI MCP enabled. Configure NAVI MCP to enable third-party address reads.`,
      );
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

    const usdcHolding = holdingsArr.find((h: { symbol?: string }) => h.symbol === 'USDC');
    const sdkSaveableUsdc = usdcHolding ? ((usdcHolding as { balance?: number }).balance ?? 0) : 0;

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
        saveableUsdc: sdkSaveableUsdc,
        address: targetAddress ?? '',
        isSelfQuery: true,
      },
      displayText: `Balance: $${balance.total.toFixed(2)} total. Wallet: $${balance.available.toFixed(2)} available. NAVI savings deposits: $${balance.savings.toFixed(2)}. Saveable USDC (only USDC can be saved): ${sdkSaveableUsdc.toFixed(2)} USDC.`,
    };
  },
});
