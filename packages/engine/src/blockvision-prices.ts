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

import { getDecimalsForCoinType, resolveSymbol, normalizeCoinType } from '@t2000/sdk';
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

  // [v0.47.1] Cache + STABLE_USD_PRICES are keyed by long-form coin types
  // (64-hex address). Caller inputs may be short-form (`0x2::sui::SUI`).
  // Normalize for lookup, but preserve the caller's original string in
  // the result map so consumers indexing by their input keys still work.
  const result: Record<string, { price: number; change24h?: number }> = {};
  const stillMissing: string[] = [];
  for (const original of coinTypes) {
    const norm = normalizeCoinType(original);
    if (cached[norm]) {
      result[original] = cached[norm];
      continue;
    }
    const stable = STABLE_USD_PRICES[norm];
    if (typeof stable === 'number') {
      result[original] = { price: stable };
      continue;
    }
    stillMissing.push(original);
  }

  if (stillMissing.length === 0) return result;
  if (!apiKey || apiKey.trim().length === 0) {
    return result;
  }

  const fetched = await fetchPricesFromBlockVision(stillMissing, apiKey);
  Object.assign(result, fetched);

  // Cache by long form so subsequent calls with either form hit the cache.
  const cacheUpdates: Record<string, { price: number; change24h?: number }> = {};
  for (const [original, value] of Object.entries(fetched)) {
    cacheUpdates[normalizeCoinType(original)] = value;
  }
  const merged = { ...cached, ...cacheUpdates };
  priceMapCache = { prices: merged, ts: cacheValid ? priceMapCache!.ts : now };

  return result;
}

async function fetchPricesFromBlockVision(
  coinTypes: string[],
  apiKey: string,
): Promise<Record<string, { price: number; change24h?: number }>> {
  const out: Record<string, { price: number; change24h?: number }> = {};

  // [v0.47.1] BlockVision's `/coin/price/list` requires fully-normalized
  // 64-hex coin types — short forms like `0x2::sui::SUI` come back with
  // `result.prices = {}` even on Pro. Normalize before sending; build a
  // long→original map so callers who passed `0x2::sui::SUI` see exactly
  // that key in the response (not the long form BlockVision echoes back).
  const longToOriginal = new Map<string, string>();
  for (const original of coinTypes) {
    const long = normalizeCoinType(original);
    if (!longToOriginal.has(long)) longToOriginal.set(long, original);
  }
  const longForms = Array.from(longToOriginal.keys());

  for (let i = 0; i < longForms.length; i += PRICE_LIST_CHUNK) {
    const chunk = longForms.slice(i, i + PRICE_LIST_CHUNK);
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
    for (const [returnedType, priceStr] of Object.entries(prices)) {
      const price = parseNumberOrNull(priceStr);
      if (price == null) continue;
      // BlockVision echoes whatever long form we sent. Map back to the
      // caller's input string, falling through to the returned key for
      // safety if BlockVision ever normalizes differently than we do.
      const original = longToOriginal.get(returnedType) ?? returnedType;
      const change24h = parseNumberOrNull(changes[returnedType]);
      out[original] = change24h == null ? { price } : { price, change24h };
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

// ---------------------------------------------------------------------------
// [v0.50] DeFi portfolio aggregation
//
// `balance_check` historically returned only wallet coins + NAVI savings,
// missing DeFi positions on Cetus / Suilend / Scallop / Bluefin / Aftermath /
// Haedal — for active users this can be the majority of net worth, so the
// reported total under-represented reality (e.g. funkii: SuiVision $39.7k
// vs balance_check $30.4k, gap = $8.5k DeFi).
//
// Fix: parallel fan-out across the top 6 Sui DeFi protocols using
// BlockVision's `/account/defiPortfolio` endpoint. NAVI is INTENTIONALLY
// excluded — savings come from `positionFetcher` (audric host hook) or
// NAVI MCP, both of which already cover it. Adding NAVI here would
// double-count.
//
// Long-tail protocols (typus, bucket2, alphafi, kai, kriya, momentum, turbos,
// flowx, suins-staking, deepbook, walrus, bluemove, ember, magma, ferra,
// r25, alphalend, suistake, steamm, unihouse) are left out — adding them
// costs +20 parallel calls per balance_check for ~5% additional coverage.
// Expand iff users report missing positions for a long-tail protocol.
//
// Pricing: callers pass a `priceHints` map (typically derived from the
// wallet portfolio's coin prices). Coin types that appear in DeFi
// positions but not in the wallet (e.g. one half of an LP that the user
// doesn't otherwise hold) are looked up via a single batched
// `fetchTokenPrices` call. STABLE_USD_PRICES short-circuits stables.
//
// Failure isolation: a 5xx for one protocol drops just that protocol. The
// `source` field on the result surfaces 'partial' when any protocol failed.
// ---------------------------------------------------------------------------

const DEFI_PORTFOLIO_TIMEOUT_MS = 4_000;
const DEFI_CACHE_TTL_MS = 60_000;

const DEFI_PROTOCOLS = [
  'cetus',
  'suilend',
  'scallop',
  'bluefin',
  'aftermath',
  'haedal',
] as const;
type DefiProtocol = (typeof DEFI_PROTOCOLS)[number];

export interface DefiSummary {
  /** Net USD value of all aggregated DeFi positions (supply + collateral - debt). */
  totalUsd: number;
  /** Per-protocol breakdown for cards / debugging. Only protocols with non-zero value are present. */
  perProtocol: Partial<Record<DefiProtocol, number>>;
  pricedAt: number;
  /**
   * `blockvision` — all 6 protocols responded successfully.
   * `partial` — at least one protocol failed; total may under-count.
   * `degraded` — no API key or every protocol failed; total = 0.
   */
  source: 'blockvision' | 'partial' | 'degraded';
}

interface DefiCacheEntry {
  data: DefiSummary;
  ts: number;
}
const defiCache = new Map<string, DefiCacheEntry>();
const defiInflight = new Map<string, Promise<DefiSummary>>();

interface BlockVisionDefiResponse {
  code: number;
  message: string;
  result?: Record<string, unknown>;
}

export async function fetchAddressDefiPortfolio(
  address: string,
  apiKey: string | undefined,
  priceHints: Record<string, number> = {},
): Promise<DefiSummary> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { totalUsd: 0, perProtocol: {}, pricedAt: Date.now(), source: 'degraded' };
  }

  const now = Date.now();
  const cached = defiCache.get(address);
  if (cached && now - cached.ts < DEFI_CACHE_TTL_MS) return cached.data;

  let inflight = defiInflight.get(address);
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const settled = await Promise.allSettled(
        DEFI_PROTOCOLS.map((p) => fetchOneDefiProtocol(address, p, apiKey)),
      );

      // Pass 1 — discover every coin type referenced across all protocol
      // responses, then fill any missing prices in a single batched call.
      const seen = new Set<string>();
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) collectCoinTypes(s.value, seen);
      }
      const normalizedHints: Record<string, number> = {};
      for (const [k, v] of Object.entries(priceHints)) {
        normalizedHints[normalizeCoinType(k)] = v;
      }
      const missing = Array.from(seen).filter((ct) => {
        const norm = normalizeCoinType(ct);
        return !normalizedHints[norm] && !STABLE_USD_PRICES[norm];
      });
      let fetchedPrices: Record<string, { price: number }> = {};
      if (missing.length > 0) {
        try {
          fetchedPrices = await fetchTokenPrices(missing, apiKey);
        } catch (err) {
          console.warn('[defi] fill-missing-prices failed:', err);
        }
      }

      const prices: Record<string, number> = { ...normalizedHints };
      for (const [ct, v] of Object.entries(fetchedPrices)) {
        prices[normalizeCoinType(ct)] ??= v.price;
      }
      for (const [ct, p] of Object.entries(STABLE_USD_PRICES)) {
        prices[normalizeCoinType(ct)] ??= p;
      }

      // Pass 2 — run the per-protocol normaliser. Each is a small pure
      // function that knows how to walk that protocol's bespoke shape.
      let totalUsd = 0;
      let failures = 0;
      const perProtocol: Partial<Record<DefiProtocol, number>> = {};

      for (let i = 0; i < DEFI_PROTOCOLS.length; i++) {
        const proto = DEFI_PROTOCOLS[i];
        const s = settled[i];
        if (s.status !== 'fulfilled' || !s.value) {
          failures++;
          continue;
        }
        try {
          const usd = NORMALIZERS[proto](s.value, prices);
          if (Number.isFinite(usd) && usd !== 0) {
            perProtocol[proto] = usd;
            totalUsd += usd;
          }
        } catch (err) {
          console.warn(`[defi] ${proto} normaliser threw:`, err);
          failures++;
        }
      }

      // Floor under-zero rollups to 0 — net negative would mean borrows >
      // supplies on a *DeFi-only* basis, which is implausible without
      // collateral counted; safer to surface 0 than a misleading negative.
      if (totalUsd < 0) totalUsd = 0;

      const summary: DefiSummary = {
        totalUsd,
        perProtocol,
        pricedAt: Date.now(),
        source: failures === DEFI_PROTOCOLS.length ? 'degraded' : failures > 0 ? 'partial' : 'blockvision',
      };
      defiCache.set(address, { data: summary, ts: Date.now() });
      return summary;
    } finally {
      defiInflight.delete(address);
    }
  })();

  defiInflight.set(address, inflight);
  return inflight;
}

async function fetchOneDefiProtocol(
  address: string,
  protocol: DefiProtocol,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const url = `${BLOCKVISION_BASE}/account/defiPortfolio?address=${encodeURIComponent(address)}&protocol=${protocol}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(DEFI_PORTFOLIO_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn(`[defi] ${protocol} fetch threw:`, err);
    return null;
  }
  if (!res.ok) {
    console.warn(`[defi] ${protocol} HTTP ${res.status}`);
    return null;
  }
  let json: BlockVisionDefiResponse;
  try {
    json = (await res.json()) as BlockVisionDefiResponse;
  } catch (err) {
    console.warn(`[defi] ${protocol} JSON parse failed:`, err);
    return null;
  }
  if (json.code !== 200 || !json.result) return null;
  return json.result;
}

/**
 * Walks the response object recursively and collects every string value at
 * any key that looks like a Sui coin-type field (`coinType`, `coinTypeA`,
 * `coinTypeB`, `tokenXType`, `tokenYType`, `coinAddress`, `phantomType`,
 * `typeName`). Used to discover which token prices we still need to fetch
 * before normalisers run.
 */
function collectCoinTypes(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectCoinTypes(x, out);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string' && v.startsWith('0x') && v.includes('::')) {
      const lk = k.toLowerCase();
      if (
        lk.includes('cointype') ||
        lk === 'cointypea' ||
        lk === 'cointypeb' ||
        lk === 'tokenxtype' ||
        lk === 'tokenytype' ||
        lk === 'coinaddress' ||
        lk === 'phantomtype' ||
        lk === 'typename'
      ) {
        out.add(v);
      }
    } else if (typeof v === 'object' && v !== null) {
      collectCoinTypes(v, out);
    }
  }
}

function priceFor(coinType: string, prices: Record<string, number>): number {
  const norm = normalizeCoinType(coinType);
  return prices[norm] ?? prices[coinType] ?? STABLE_USD_PRICES[norm] ?? 0;
}

function rawToUsd(
  coinType: string,
  raw: unknown,
  decimalsHint: number | undefined,
  prices: Record<string, number>,
): number {
  if (raw == null) return 0;
  const decimals =
    typeof decimalsHint === 'number' ? decimalsHint : getDecimalsForCoinType(coinType);
  const amount = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(amount)) return 0;
  return amount * priceFor(coinType, prices);
}

const NORMALIZERS: Record<
  DefiProtocol,
  (result: Record<string, unknown>, prices: Record<string, number>) => number
> = {
  cetus: normalizeCetus,
  suilend: normalizeSuilend,
  scallop: normalizeScallop,
  bluefin: normalizeBluefin,
  aftermath: normalizeAftermath,
  haedal: normalizeHaedal,
};

interface CetusPair {
  coinTypeA?: string;
  coinTypeB?: string;
  balanceA?: number | string;
  balanceB?: number | string;
  coinAAmount?: number | string;
  coinBAmount?: number | string;
  coinTypeADecimals?: number;
  coinTypeBDecimals?: number;
  coinA?: { decimals?: number };
  coinB?: { decimals?: number };
}

function normalizeCetus(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.cetus as { lps?: CetusPair[]; farms?: CetusPair[]; vaults?: CetusPair[] }) ?? {};
  let total = 0;
  const sumPair = (item: CetusPair, aField: 'balanceA' | 'coinAAmount', bField: 'balanceB' | 'coinBAmount') => {
    if (item.coinTypeA && item[aField] != null) {
      const dec = item.coinTypeADecimals ?? item.coinA?.decimals;
      total += rawToUsd(item.coinTypeA, item[aField], dec, prices);
    }
    if (item.coinTypeB && item[bField] != null) {
      const dec = item.coinTypeBDecimals ?? item.coinB?.decimals;
      total += rawToUsd(item.coinTypeB, item[bField], dec, prices);
    }
  };
  for (const lp of data.lps ?? []) sumPair(lp, 'balanceA', 'balanceB');
  for (const farm of data.farms ?? []) sumPair(farm, 'balanceA', 'balanceB');
  for (const vault of data.vaults ?? []) sumPair(vault, 'coinAAmount', 'coinBAmount');
  return total;
}

interface SuilendItem {
  coinType?: string;
  decimals?: number;
  amount?: number | string;
}

function normalizeSuilend(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.suilend as {
      deposits?: SuilendItem[];
      borrows?: SuilendItem[];
      strategies?: SuilendItem[];
    }) ?? {};
  let total = 0;
  for (const d of data.deposits ?? []) {
    if (d.coinType && d.amount != null) total += rawToUsd(d.coinType, d.amount, d.decimals, prices);
  }
  for (const b of data.borrows ?? []) {
    if (b.coinType && b.amount != null) total -= rawToUsd(b.coinType, b.amount, b.decimals, prices);
  }
  for (const s of data.strategies ?? []) {
    if (s.coinType && s.amount != null) total += rawToUsd(s.coinType, s.amount, s.decimals, prices);
  }
  return total;
}

function normalizeScallop(
  result: Record<string, unknown>,
  _prices: Record<string, number>,
): number {
  const s = result.scallop as
    | {
        totalSupplyValue?: number | string;
        totalDebtValue?: number | string;
        totalCollateralValue?: number | string;
        totalLockedScaValue?: number | string;
      }
    | undefined;
  if (!s) return 0;
  const supply = Number(s.totalSupplyValue ?? 0);
  const collateral = Number(s.totalCollateralValue ?? 0);
  const locked = Number(s.totalLockedScaValue ?? 0);
  const debt = Number(s.totalDebtValue ?? 0);
  const net = (Number.isFinite(supply) ? supply : 0) +
    (Number.isFinite(collateral) ? collateral : 0) +
    (Number.isFinite(locked) ? locked : 0) -
    (Number.isFinite(debt) ? debt : 0);
  return net;
}

interface BluefinLp {
  coinTypeA?: string;
  coinTypeB?: string;
  coinAmountA?: number | string;
  coinAmountB?: number | string;
}

function normalizeBluefin(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.bluefin as {
      lps?: BluefinLp[];
      usdcVault?: { amount?: number | string };
      blueVault?: { amount?: number | string };
    }) ?? {};
  let total = 0;
  for (const lp of data.lps ?? []) {
    if (lp.coinTypeA && lp.coinAmountA != null) {
      total += rawToUsd(lp.coinTypeA, lp.coinAmountA, undefined, prices);
    }
    if (lp.coinTypeB && lp.coinAmountB != null) {
      total += rawToUsd(lp.coinTypeB, lp.coinAmountB, undefined, prices);
    }
  }
  // Bluefin's vaults expose a raw `amount` without a coinType — assume USDC
  // (6dp) for usdcVault and BLUE (9dp) for blueVault per the BlockVision
  // schema. If BlockVision adds new vaults we'll under-count until updated.
  if (data.usdcVault?.amount != null) {
    total += rawToUsd(
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      data.usdcVault.amount,
      6,
      prices,
    );
  }
  if (data.blueVault?.amount != null) {
    total += rawToUsd(
      '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE',
      data.blueVault.amount,
      9,
      prices,
    );
  }
  return total;
}

interface AftermathPosition {
  coins?: Array<{ coinType?: string; amount?: number | string }>;
}

function normalizeAftermath(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.aftermath as {
      lpPositions?: AftermathPosition[];
      farmPositions?: AftermathPosition[];
    }) ?? {};
  let total = 0;
  const positions = [...(data.lpPositions ?? []), ...(data.farmPositions ?? [])];
  for (const pos of positions) {
    for (const c of pos.coins ?? []) {
      if (c.coinType && c.amount != null) {
        total += rawToUsd(c.coinType, c.amount, undefined, prices);
      }
    }
  }
  return total;
}

function normalizeHaedal(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const SUI_TYPE_FULL =
    '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
  const data =
    (result.haedal as {
      lps?: BluefinLp[];
      stakings?: Array<{ sui_amount?: number | string }>;
    }) ?? {};
  let total = 0;
  for (const lp of data.lps ?? []) {
    // Haedal LP shape mirrors Bluefin — but uses balanceA/balanceB instead of
    // coinAmountA/B (the BlockVision doc shows `balanceA`/`balanceB`).
    const item = lp as BluefinLp & { balanceA?: number | string; balanceB?: number | string };
    if (item.coinTypeA && item.balanceA != null) {
      total += rawToUsd(item.coinTypeA, item.balanceA, undefined, prices);
    }
    if (item.coinTypeB && item.balanceB != null) {
      total += rawToUsd(item.coinTypeB, item.balanceB, undefined, prices);
    }
  }
  for (const stake of data.stakings ?? []) {
    if (stake.sui_amount != null) {
      total += rawToUsd(SUI_TYPE_FULL, stake.sui_amount, 9, prices);
    }
  }
  return total;
}

export function clearDefiCache(): void {
  defiCache.clear();
  defiInflight.clear();
}

export function clearDefiCacheFor(address: string): void {
  defiCache.delete(address);
  defiInflight.delete(address);
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
