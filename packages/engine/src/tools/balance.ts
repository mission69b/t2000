import { z } from 'zod';
import { buildTool } from '../tool.js';
import { hasNaviMcpGlobal, getMcpManager, requireAgent } from './utils.js';
import type { McpClientManager } from '../mcp/client.js';
import { NAVI_SERVER_NAME, NaviTools } from '../navi/config.js';
import {
  parseMcpJson,
  transformPositions,
  transformRewards,
} from '../navi/transforms.js';
import {
  fetchAddressPortfolio,
  fetchAddressDefiPortfolio,
  type AddressPortfolio,
  type DefiSummary,
} from '../blockvision-prices.js';
import { fetchAudricPortfolio, type AudricPortfolioResult } from '../audric-api.js';
import { normalizeAddressInput } from '../sui/address.js';

const GAS_RESERVE_SUI = 0.05;

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
  // [SPEC 8 v0.5.1 B3.2] Forward the per-tool retry counter so any
  // BlockVision retries during the wallet read surface as `attemptCount`
  // on the eventual `tool_result` event.
  retryStats?: { attemptCount: number },
): Promise<AddressPortfolio> {
  if (cache) {
    const hit = cache.get(address);
    if (hit) return hit;
  }
  const portfolio = await fetchAddressPortfolio(address, blockvisionApiKey, fallbackRpcUrl, { retryStats });
  if (cache) cache.set(address, portfolio);
  return portfolio;
}

export const balanceCheckTool = buildTool({
  name: 'balance_check',
  description:
    'Get the full balance breakdown for the signed-in user OR any public Sui address or SuiNS name. Returns wallet holdings (tokens the address owns — NOT savings), NAVI savings deposits (USDC and/or USDsui deposited into NAVI Protocol earning yield), outstanding debt, pending rewards, gas reserve, total net worth, saveableUsdc (USDC wallet balance available to save), and saveableUsdsui (USDsui wallet balance available to save — surfaces only when > 0). IMPORTANT: wallet holdings like GOLD, SUI, USDT, USDe are NOT savings positions and are NOT saveable — only USDC and USDsui can be saved/borrowed. Pass `address` as a 0x address OR a SuiNS name (e.g. "alex.sui") to inspect a contact / watched / public wallet; defaults to the signed-in user when omitted.',
  inputSchema: z.object({
    address: z
      .string()
      .optional()
      .describe('Sui address (0x…) or SuiNS name (alex.sui). Defaults to the signed-in wallet when omitted.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Sui address (0x…) or SuiNS name (e.g. alex.sui). The engine resolves the name to an on-chain address before querying. Omit to default to the signed-in wallet.',
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
    // [v1.2 SuiNS] Normalize the user-supplied address. Accepts both 0x
    // hex and *.sui names; throws structured errors when the input is
    // malformed or the SuiNS name doesn't resolve. Stamps `suinsName` on
    // the result so the host card can render "Balance · alex.sui · 0x12…ab"
    // instead of just the truncated hex.
    let suinsName: string | null = null;
    let targetAddress: string | undefined;
    if (input.address) {
      const normalized = await normalizeAddressInput(input.address, {
        suiRpcUrl: context.suiRpcUrl,
        signal: context.signal,
      });
      targetAddress = normalized.address;
      suinsName = normalized.suinsName;
    } else {
      targetAddress = context.walletAddress;
    }
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

      // [single-source-of-truth — Apr 2026] When the engine runs inside
      // audric (T2000_AUDRIC_API / AUDRIC_INTERNAL_API_URL set), prefer
      // audric's canonical `/api/portfolio` so the LLM, dashboard, and
      // daily cron all read identical numbers. Returns null in
      // CLI / MCP / standalone mode → falls back to the BlockVision +
      // NAVI MCP path below.
      const audricPortfolio = await fetchAudricPortfolio(
        address,
        context.env,
        context.signal,
      );

      // [v1.4 BlockVision] Single BlockVision call returns coins +
      // balances + prices in one shot, replacing the parallel
      // (Sui RPC fetchWalletCoins + DefiLlama fetchTokenPrices) pair.
      // Run alongside positions / rewards / positionFetcher so total
      // wall time is bound by the slowest of the four.
      //
      // [v0.50.2] DeFi portfolio fetch added as a 5th parallel leg —
      // hits BlockVision /account/defiPortfolio for the 9 most-used Sui
      // DeFi protocols (Cetus, Suilend, Scallop, Bluefin, Aftermath,
      // Haedal, Suistake, SuiNS-staking, Walrus). Excludes NAVI to avoid
      // double-counting against positionFetcher/MCP savings. v0.50.1
      // briefly fanned out to all 26 BV protocols but the resulting
      // burst caused the wallet `/account/coins` call to occasionally
      // 429 and silently degrade to RPC (where non-stables are unpriced)
      // — so wallet display showed $0 for users with non-stable
      // holdings. v0.50.2 walks back to 9 (1 wallet + 9 DeFi = 10 burst,
      // safely below BV burst caps). Cached 60s, parallel-fanout, 5xx
      // on one protocol drops just that protocol. See
      // blockvision-prices.ts header for the generic-walker design.
      // When audric returned a canonical snapshot we already have
      // wallet + positions in one shot — short-circuit the parallel
      // BlockVision + NAVI fan-out so we don't double-pay the latency
      // and so the numbers in the result match audric's API exactly.
      const usingAudricSnapshot = audricPortfolio !== null;
      const audric: AudricPortfolioResult | null = audricPortfolio;

      const [portfolio, positions, rewards, serverPositions, defiPortfolio] = await Promise.all([
        usingAudricSnapshot
          ? Promise.resolve(audric!.portfolio)
          : loadPortfolio(
              address,
              context.blockvisionApiKey,
              context.suiRpcUrl,
              context.portfolioCache,
              context.retryStats,
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
        usingAudricSnapshot || hasPositionFetcher
          ? Promise.resolve(null)
          : callNavi(mgr, NaviTools.GET_POSITIONS, {
              address,
              protocols: 'navi',
              format: 'json',
            }).catch((err) => {
              console.warn('[balance_check] NAVI GET_POSITIONS failed:', err);
              return null;
            }),
        usingAudricSnapshot || hasPositionFetcher
          ? Promise.resolve(null)
          : callNavi(mgr, NaviTools.GET_AVAILABLE_REWARDS, { address }).catch((err) => {
              console.warn('[balance_check] NAVI GET_AVAILABLE_REWARDS failed:', err);
              return null;
            }),
        usingAudricSnapshot
          ? Promise.resolve(audric!.positions)
          : hasPositionFetcher
            ? context.positionFetcher!(address).catch((err) => {
                console.warn('[balance_check] positionFetcher failed:', err);
                return null;
              })
            : Promise.resolve(null),
        // [v0.50] DeFi leg — independent of NAVI (excluded) and the wallet
        // portfolio (which only has coin holdings). Failure here surfaces
        // as defi.totalUsd === 0 and `source: 'degraded'`, leaving the
        // rest of balance_check unaffected. The fetcher fills its own
        // prices via fetchTokenPrices for any coin types it discovers.
        fetchAddressDefiPortfolio(address, context.blockvisionApiKey, {}, { retryStats: context.retryStats }).catch((err) => {
          console.warn('[balance_check] defi fetch failed:', err);
          const fallback: DefiSummary = {
            totalUsd: 0,
            perProtocol: {},
            pricedAt: Date.now(),
            source: 'degraded',
          };
          return fallback;
        }),
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
      // [v0.51.0] USDsui is the second permitted saveable asset. Surface its
      // balance separately so the LLM can answer "how much can I save?" with
      // both stables, and so the displayText flags it (saveable) instead of
      // letting the LLM treat it as a generic holding. Not rolled into
      // `saveableUsdc` — the field name is canonical for USDC and downstream
      // permission/Tier resolvers depend on it.
      const usdsuiHolding = holdings.find((h) => h.symbol === 'USDsui');
      const saveableUsdsui = usdsuiHolding ? usdsuiHolding.balance : 0;

      // [v0.50] DeFi summary already resolved in the parallel fan-out
      // above. The fetcher fills its own prices via fetchTokenPrices for
      // any coin types found in DeFi positions that aren't stables.
      // Long-tail LP partner tokens that BlockVision's price list
      // doesn't cover may under-count — acceptable Phase 1 trade-off.
      const defi: DefiSummary = defiPortfolio;

      const bal = {
        available: availableUsd,
        savings,
        debt,
        pendingRewards: pendingRewardsUsd,
        gasReserve: gasReserveUsd,
        defi: defi.totalUsd,
        defiByProtocol: defi.perProtocol,
        defiSource: defi.source,
        // [v0.54] Forward the DeFi entry's pricedAt so the BalanceCard
        // can render "cached Nm ago" when source === 'partial-stale'.
        // Always populated; consumers ignore unless source is stale.
        defiPricedAt: defi.pricedAt,
        total: availableUsd + savings + gasReserveUsd + pendingRewardsUsd + defi.totalUsd - debt,
        stables: stablesUsd,
        holdings: visibleHoldings,
        saveableUsdc,
        saveableUsdsui,
        priceSource: portfolio.source,
        address,
        isSelfQuery,
        suinsName,
      };

      const holdingsList = visibleHoldings.map((h) => `${h.symbol}: ${h.balance < 1 ? h.balance.toFixed(6) : h.balance.toFixed(2)} ($${h.usdValue.toFixed(2)})`).join(', ');
      const subjectLabel = suinsName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
      const subjectPrefix = isSelfQuery ? 'Balance' : `Balance for ${subjectLabel}`;
      // Surface the DeFi fetch state so the LLM can answer accurately:
      //   - `blockvision` + total > 0  → list protocols and dollar value
      //   - `blockvision` + total === 0 → genuinely no positions in the 9 covered protocols
      //   - `partial`                  → at least one protocol failed; total may under-count
      //   - `degraded`                 → no API key OR every protocol failed; total UNKNOWN, not zero
      // Pre-v0.50.3 we silently emitted `''` for zero/degraded, which let
      // the LLM confidently assert "no DeFi positions" when in reality the
      // fetcher had been short-circuited by a missing BLOCKVISION_API_KEY.
      const defiSummaryText = (() => {
        if (defi.source === 'degraded') {
          return ' DeFi positions (Bluefin / Suilend / Cetus / etc.): UNAVAILABLE — DeFi data source is currently unreachable. Do NOT assert "no DeFi positions"; tell the user this slice is temporarily unknown and the total above EXCLUDES DeFi.';
        }
        if (defi.source === 'partial-stale' && defi.totalUsd > 0) {
          // [v0.54] Sticky-positive cache fallback — fresh BlockVision
          // call failed but we have a recent positive value. The total
          // INCLUDES this stale value (it's the most accurate number
          // we have right now), but mention provenance honestly.
          const ageMin = Math.round((Date.now() - defi.pricedAt) / 60_000);
          return ` Other DeFi positions (LPs/staking/lending across ${Object.keys(defi.perProtocol).join('/')}): $${defi.totalUsd.toFixed(2)} (last refresh ${ageMin}m ago — live BlockVision call failed, using cached value).`;
        }
        if (defi.totalUsd > 0) {
          const partialNote = defi.source === 'partial' ? ' (partial — one or more protocols failed; value may under-count)' : '';
          return ` Other DeFi positions (LPs/staking/lending across ${Object.keys(defi.perProtocol).join('/')}): $${defi.totalUsd.toFixed(2)}${partialNote}.`;
        }
        if (defi.source === 'partial') {
          // [v0.53.4] Stronger wording. Pre-fix this returned a soft
          // "caveat that the picture may be incomplete", which the
          // LLM consistently dropped from its narration when at least
          // one major protocol (Bluefin/Suilend/Cetus) 429'd during a
          // burst. The narration would then claim "$X total" with NO
          // mention of the missing slice, even when the same address
          // 30s later (cache miss → fresh fetch) showed thousands of
          // dollars in DeFi via the timeline canvas. Reworded to be
          // an explicit instruction matching the `degraded` branch.
          // (v0.54 reduces how often this branch fires by adding the
          // sticky-positive fallback above — partial+0 with a recent
          // positive cache now resolves to `partial-stale` instead.)
          return ' DeFi positions: UNKNOWN — at least one protocol failed to respond. The total above EXCLUDES any DeFi the failing protocols may hold. Do NOT assert "no DeFi positions" or "DeFi: $0"; tell the user DeFi is temporarily unreachable for this address.';
        }
        return '';
      })();
      const saveableSummary = saveableUsdsui > 0
        ? `Saveable: ${saveableUsdc.toFixed(2)} USDC + ${saveableUsdsui.toFixed(saveableUsdsui < 1 ? 4 : 2)} USDsui (only USDC and USDsui can be saved/borrowed).`
        : `Saveable USDC (only USDC and USDsui can be saved): ${saveableUsdc.toFixed(2)} USDC.`;
      return {
        data: bal,
        displayText: `${subjectPrefix}: $${bal.total.toFixed(2)} total. Wallet holdings (NOT savings): ${holdingsList || 'none'}. NAVI savings deposits: $${bal.savings.toFixed(2)}.${defiSummaryText} ${saveableSummary}`,
      };
    }

    // SDK agent fallback — only meaningful for the signed-in user (the
    // SDK's `balance()` method is bound to the agent's own wallet). If
    // the LLM passed a different address (post-normalization), refuse
    // rather than silently returning the agent's own balance.
    if (
      targetAddress &&
      context.walletAddress &&
      targetAddress.toLowerCase() !== context.walletAddress.toLowerCase()
    ) {
      throw new Error(
        `Cannot inspect ${targetAddress.slice(0, 8)}… without NAVI MCP enabled. Configure NAVI MCP to enable third-party address reads.`,
      );
    }
    const agent = requireAgent(context);
    // [v0.50] In the SDK fallback path (CLI-only, self-query) we also
    // fan out to BlockVision /account/defiPortfolio so the CLI matches
    // engine + audric numbers. No-op when blockvisionApiKey is unset
    // (returns DefiSummary with source: 'degraded' and totalUsd: 0).
    const fetchAddress = (targetAddress ?? context.walletAddress) as string;
    const [balance, defi] = await Promise.all([
      agent.balance(),
      fetchAddressDefiPortfolio(fetchAddress, context.blockvisionApiKey, {}, { retryStats: context.retryStats }).catch((err) => {
        console.warn('[balance_check] sdk-path defi fetch failed:', err);
        const fallback: DefiSummary = {
          totalUsd: 0,
          perProtocol: {},
          pricedAt: Date.now(),
          source: 'degraded',
        };
        return fallback;
      }),
    ]);

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
    const usdsuiHolding = holdingsArr.find((h: { symbol?: string }) => h.symbol === 'USDsui');
    const sdkSaveableUsdsui = usdsuiHolding ? ((usdsuiHolding as { balance?: number }).balance ?? 0) : 0;

    const sdkDefiSummaryText = (() => {
      if (defi.source === 'degraded') {
        return ' DeFi positions: UNAVAILABLE — data source unreachable. Do NOT claim "no DeFi positions"; report this slice as temporarily unknown and the total above EXCLUDES DeFi.';
      }
      if (defi.source === 'partial-stale' && defi.totalUsd > 0) {
        // [v0.54] Mirror of MCP-path sticky-positive narration.
        const ageMin = Math.round((Date.now() - defi.pricedAt) / 60_000);
        return ` Other DeFi positions (LPs/staking/lending across ${Object.keys(defi.perProtocol).join('/')}): $${defi.totalUsd.toFixed(2)} (last refresh ${ageMin}m ago — live BlockVision call failed, using cached value).`;
      }
      if (defi.totalUsd > 0) {
        const partialNote = defi.source === 'partial' ? ' (partial — one or more protocols failed; value may under-count)' : '';
        return ` Other DeFi positions (LPs/staking/lending across ${Object.keys(defi.perProtocol).join('/')}): $${defi.totalUsd.toFixed(2)}${partialNote}.`;
      }
      if (defi.source === 'partial') {
        // [v0.53.4] Mirror of the MCP-path strengthening — see the
        // companion comment ~70 lines up for full rationale.
        return ' DeFi positions: UNKNOWN — at least one protocol failed to respond. The total above EXCLUDES any DeFi the failing protocols may hold. Do NOT assert "no DeFi positions" or "DeFi: $0"; tell the user DeFi is temporarily unreachable for this wallet.';
      }
      return '';
    })();
    const sdkTotal = balance.total + defi.totalUsd;

    return {
      data: {
        available: balance.available,
        savings: balance.savings,
        debt: balance.debt,
        pendingRewards: balance.pendingRewards,
        gasReserve: gasReserveUsd,
        defi: defi.totalUsd,
        defiByProtocol: defi.perProtocol,
        defiSource: defi.source,
        // [v0.54] Same staleness provenance as the MCP path above.
        defiPricedAt: defi.pricedAt,
        total: sdkTotal,
        stables: stablesTotal,
        holdings: holdingsArr,
        saveableUsdc: sdkSaveableUsdc,
        saveableUsdsui: sdkSaveableUsdsui,
        address: targetAddress ?? '',
        isSelfQuery: true,
        suinsName,
      },
      displayText: `Balance: $${sdkTotal.toFixed(2)} total. Wallet: $${balance.available.toFixed(2)} available. NAVI savings deposits: $${balance.savings.toFixed(2)}.${sdkDefiSummaryText} ${sdkSaveableUsdsui > 0 ? `Saveable: ${sdkSaveableUsdc.toFixed(2)} USDC + ${sdkSaveableUsdsui.toFixed(sdkSaveableUsdsui < 1 ? 4 : 2)} USDsui (only USDC and USDsui can be saved/borrowed).` : `Saveable USDC (only USDC and USDsui can be saved): ${sdkSaveableUsdc.toFixed(2)} USDC.`}`,
    };
  },
});
