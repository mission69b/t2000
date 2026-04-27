// ---------------------------------------------------------------------------
// BlockVision Indexer REST API — wallet portfolio + multi-token price feed.
//
// Replaces the DefiLlama public price endpoint (`coins.llama.fi`) for both
// `balance_check` (full portfolio) and `portfolio_analysis` /
// `engine-factory` prompt-time price seeding (multi-token quotes).
//
// Two endpoints are wrapped here:
//
//   GET /v2/sui/account/coins         — full wallet portfolio + USD prices
//                                       (paid Pro-tier endpoint; one call)
//   GET /v2/sui/coin/price/list       — multi-token price list
//                                       (max 10 tokens per call; chunked
//                                        transparently if more are passed)
//
// Auth: `x-api-key` header. The shared API key is available as
// `process.env.BLOCKVISION_API_KEY` in the audric web app and is threaded
// into `ToolContext.blockvisionApiKey` via the engine factory.
//
// Failure mode: degraded fallback. If BlockVision returns 5xx or the
// `apiKey` is missing/blank we drop to a Sui-RPC + hardcoded-stable
// allow-list path. The portfolio still resolves with raw balances; coins
// in `STABLE_USD_PRICES` get a $1.00 mark, everything else gets `null`
// price. Acceptable for Audric's stablecoin-heavy users — the wallet/
// holdings list still renders, only USD value rolls up incompletely.
// The `source` field on the returned portfolio surfaces the path so
// callers can decide whether to badge "approximate" totals.
// ---------------------------------------------------------------------------

import { getDecimalsForCoinType, resolveSymbol } from '@t2000/sdk';
import { fetchWalletCoins } from './sui-rpc.js';

const BLOCKVISION_BASE = 'https://api.blockvision.org/v2/sui';
const PORTFOLIO_TIMEOUT_MS = 4_000;
const PRICES_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 60_000;
// BlockVision caps `tokenIds` at 10. Internal callers (engine-factory, the
// future `token_prices` LLM tool) may request more — we chunk transparently.
const PRICE_LIST_CHUNK = 10;

/**
 * Hardcoded $1.00 allow-list for the canonical Sui stablecoins. Used in
 * two places:
 *   1. `fetchTokenPrices` short-circuit — the LLM rarely needs to quote
 *      USDC/USDT against an external feed, and skipping the network call
 *      saves ~200–400ms p50 per balance render.
 *   2. Sui-RPC degraded fallback inside `fetchAddressPortfolio` — when
 *      BlockVision is unavailable, stables still resolve to USD so the
 *      visible "$X total" doesn't suddenly read $0.
 *
 * Coverage rationale: the four native Sui stables (USDC/USDT/USDe/USDsui)
 * plus the two Wormhole-bridged variants present in legacy wallets. We
 * intentionally do NOT include long-tail "USD*" tokens — depeg risk is
 * real (e.g. Frax, sUSD) and a stale $1.00 on a depegged asset is more
 * misleading than `null`.
 */
const STABLE_USD_PRICES: Readonly<Record<string, number>> = {
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': 1,
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': 1,
  '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE': 1,
  '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI': 1,
  '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN': 1,
  '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': 1,
};

export interface PortfolioCoin {
  coinType: string;
  symbol: string;
  decimals: number;
  /** Raw on-chain amount (string to preserve precision). */
  balance: string;
  /** USD spot price; `null` when not available (long-tail, degraded mode). */
  price: number | null;
  /** balance/10^decimals * price; `null` when price is `null`. */
  usdValue: number | null;
}

export interface AddressPortfolio {
  coins: PortfolioCoin[];
  totalUsd: number;
  pricedAt: number;
  source: 'blockvision' | 'sui-rpc-degraded';
}

interface PortfolioCacheEntry {
  data: AddressPortfolio;
  ts: number;
}
const portfolioCache = new Map<string, PortfolioCacheEntry>();
const portfolioInflight = new Map<string, Promise<AddressPortfolio>>();

interface PriceMapCacheEntry {
  prices: Record<string, { price: number; change24h?: number }>;
  ts: number;
}
let priceMapCache: PriceMapCacheEntry | null = null;

interface BlockVisionAccountCoinsResponse {
  code: number;
  message: string;
  result?: {
    coins?: Array<{
      coinType: string;
      name?: string;
      symbol?: string;
      decimals?: number;
      balance: string;
      verified?: boolean;
      logo?: string;
      usdValue?: string;
      objects?: number;
      price?: string;
      priceChangePercentage24H?: string;
    }>;
    usdValue?: string;
  };
}

interface BlockVisionPriceListResponse {
  code: number;
  message: string;
  result?: {
    prices?: Record<string, string>;
    coin24HChange?: Record<string, string>;
  };
}

/**
 * One-shot wallet portfolio fetcher. BlockVision returns balances + USD
 * prices in a single call; on failure we degrade to a Sui-RPC coin fetch
 * with hardcoded stablecoin pricing. Memoised in-process for `CACHE_TTL_MS`
 * keyed by `address` so back-to-back tool calls inside the same chat
 * session (balance_check + portfolio_analysis) share the same response.
 */
export async function fetchAddressPortfolio(
  address: string,
  apiKey: string | undefined,
  fallbackRpcUrl?: string,
): Promise<AddressPortfolio> {
  const now = Date.now();
  const cached = portfolioCache.get(address);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  let inflight = portfolioInflight.get(address);
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (apiKey && apiKey.trim().length > 0) {
        const blockvision = await fetchPortfolioFromBlockVision(address, apiKey);
        if (blockvision) {
          portfolioCache.set(address, { data: blockvision, ts: Date.now() });
          return blockvision;
        }
      }
      const degraded = await fetchPortfolioFromSuiRpc(address, fallbackRpcUrl);
      portfolioCache.set(address, { data: degraded, ts: Date.now() });
      return degraded;
    } finally {
      portfolioInflight.delete(address);
    }
  })();

  portfolioInflight.set(address, inflight);
  return inflight;
}

async function fetchPortfolioFromBlockVision(
  address: string,
  apiKey: string,
): Promise<AddressPortfolio | null> {
  const url = `${BLOCKVISION_BASE}/account/coins?account=${encodeURIComponent(address)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[blockvision-prices] portfolio fetch threw, degrading:', err);
    return null;
  }

  if (!res.ok) {
    console.warn(`[blockvision-prices] portfolio HTTP ${res.status}, degrading`);
    return null;
  }

  let json: BlockVisionAccountCoinsResponse;
  try {
    json = (await res.json()) as BlockVisionAccountCoinsResponse;
  } catch (err) {
    console.warn('[blockvision-prices] portfolio JSON parse failed, degrading:', err);
    return null;
  }

  if (json.code !== 200 || !json.result) {
    console.warn(`[blockvision-prices] portfolio code=${json.code} msg=${json.message}, degrading`);
    return null;
  }

  const rawCoins = json.result.coins ?? [];
  const coins: PortfolioCoin[] = rawCoins.map((c) => {
    const coinType = c.coinType;
    const symbol = c.symbol || resolveSymbol(coinType);
    const decimals = typeof c.decimals === 'number' ? c.decimals : getDecimalsForCoinType(coinType);
    const stablePrice = STABLE_USD_PRICES[coinType];
    const apiPrice = parseNumberOrNull(c.price);
    const apiUsd = parseNumberOrNull(c.usdValue);
    const price = apiPrice ?? stablePrice ?? null;
    let usdValue = apiUsd;
    if (usdValue == null && price != null) {
      const amount = Number(c.balance) / 10 ** decimals;
      usdValue = Number.isFinite(amount) ? amount * price : null;
    }
    return {
      coinType,
      symbol,
      decimals,
      balance: c.balance,
      price,
      usdValue,
    };
  });

  const apiTotal = parseNumberOrNull(json.result.usdValue);
  const totalUsd = apiTotal ?? coins.reduce((sum, c) => sum + (c.usdValue ?? 0), 0);

  return {
    coins,
    totalUsd,
    pricedAt: Date.now(),
    source: 'blockvision',
  };
}

async function fetchPortfolioFromSuiRpc(
  address: string,
  fallbackRpcUrl?: string,
): Promise<AddressPortfolio> {
  const walletCoins = await fetchWalletCoins(address, fallbackRpcUrl).catch((err) => {
    console.warn('[blockvision-prices] sui rpc coin fetch failed:', err);
    return [];
  });

  const coins: PortfolioCoin[] = walletCoins.map((c) => {
    const stablePrice = STABLE_USD_PRICES[c.coinType] ?? null;
    const amount = Number(c.totalBalance) / 10 ** c.decimals;
    const usdValue =
      stablePrice != null && Number.isFinite(amount) ? amount * stablePrice : null;
    return {
      coinType: c.coinType,
      symbol: c.symbol,
      decimals: c.decimals,
      balance: c.totalBalance,
      price: stablePrice,
      usdValue,
    };
  });

  const totalUsd = coins.reduce((sum, c) => sum + (c.usdValue ?? 0), 0);
  return {
    coins,
    totalUsd,
    pricedAt: Date.now(),
    source: 'sui-rpc-degraded',
  };
}

/**
 * Multi-token price lookup. Returns a map of coinType → `{ price, change24h }`
 * with the `change24h` field populated when BlockVision returns it.
 * Hardcoded stable allow-list short-circuits before the network call so
 * USDC/USDT lookups don't pay the BlockVision RTT. Chunks transparently
 * (BlockVision caps `tokenIds` at 10 per call). Cached in-process for
 * `CACHE_TTL_MS` with merge-on-miss semantics — a cache containing 8 of 10
 * requested coins fetches only the missing 2 instead of throwing the
 * whole map away.
 */
export async function fetchTokenPrices(
  coinTypes: string[],
  apiKey: string | undefined,
): Promise<Record<string, { price: number; change24h?: number }>> {
  if (coinTypes.length === 0) return {};

  const now = Date.now();
  const cacheValid = priceMapCache !== null && now - priceMapCache.ts < CACHE_TTL_MS;
  const cached = cacheValid ? priceMapCache!.prices : {};

  const result: Record<string, { price: number; change24h?: number }> = {};
  const stillMissing: string[] = [];
  for (const coinType of coinTypes) {
    if (cached[coinType]) {
      result[coinType] = cached[coinType];
      continue;
    }
    const stable = STABLE_USD_PRICES[coinType];
    if (typeof stable === 'number') {
      result[coinType] = { price: stable };
      continue;
    }
    stillMissing.push(coinType);
  }

  if (stillMissing.length === 0) return result;
  if (!apiKey || apiKey.trim().length === 0) {
    return result;
  }

  const fetched = await fetchPricesFromBlockVision(stillMissing, apiKey);
  Object.assign(result, fetched);

  const merged = { ...cached, ...fetched };
  priceMapCache = { prices: merged, ts: cacheValid ? priceMapCache!.ts : now };

  return result;
}

async function fetchPricesFromBlockVision(
  coinTypes: string[],
  apiKey: string,
): Promise<Record<string, { price: number; change24h?: number }>> {
  const out: Record<string, { price: number; change24h?: number }> = {};
  for (let i = 0; i < coinTypes.length; i += PRICE_LIST_CHUNK) {
    const chunk = coinTypes.slice(i, i + PRICE_LIST_CHUNK);
    const tokenIds = encodeURIComponent(chunk.join(','));
    const url = `${BLOCKVISION_BASE}/coin/price/list?tokenIds=${tokenIds}&show24hChange=true`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(PRICES_TIMEOUT_MS),
      });
    } catch (err) {
      console.warn('[blockvision-prices] price chunk threw, skipping:', err);
      continue;
    }

    if (!res.ok) {
      console.warn(`[blockvision-prices] price chunk HTTP ${res.status}`);
      continue;
    }

    let json: BlockVisionPriceListResponse;
    try {
      json = (await res.json()) as BlockVisionPriceListResponse;
    } catch (err) {
      console.warn('[blockvision-prices] price chunk JSON parse failed:', err);
      continue;
    }
    if (json.code !== 200 || !json.result) continue;
    const prices = json.result.prices ?? {};
    const changes = json.result.coin24HChange ?? {};
    for (const [coinType, priceStr] of Object.entries(prices)) {
      const price = parseNumberOrNull(priceStr);
      if (price == null) continue;
      const change24h = parseNumberOrNull(changes[coinType]);
      out[coinType] = change24h == null ? { price } : { price, change24h };
    }
  }
  return out;
}

function parseNumberOrNull(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string' || input.trim().length === 0) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

export function clearPortfolioCache(): void {
  portfolioCache.clear();
  portfolioInflight.clear();
}

/**
 * [v1.4 — Day 2.5] Per-address invalidator. The module-level
 * `portfolioCache` carries a 60s TTL — long enough to outlive a
 * `save_deposit` / `swap_execute` / etc. plus the engine's 1.5s
 * Sui-RPC-indexer-lag delay, so without explicit invalidation
 * `runPostWriteRefresh` would re-fetch the *cached pre-write
 * snapshot*. Engine calls this from `runPostWriteRefresh` right
 * before the lag-delay so the next `fetchAddressPortfolio` for the
 * affected address is forced to hit BlockVision again.
 *
 * No-op when `address` doesn't match a cached entry — cheap to call
 * unconditionally on every write.
 */
export function clearPortfolioCacheFor(address: string): void {
  portfolioCache.delete(address);
  portfolioInflight.delete(address);
}

export function clearPriceMapCache(): void {
  priceMapCache = null;
}
