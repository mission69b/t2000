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
// Failure mode: layered fallback. If BlockVision `/account/coins` returns
// 5xx, 429, or the `apiKey` is missing/blank we drop to a Sui-RPC path
// for the coin list, then [v0.50.3] still attempt the BlockVision
// `/coin/price/list` endpoint to USD-price non-stable holdings. Only when
// BOTH BV endpoints fail do we degrade to the hardcoded stable allow-list
// (USDC/USDT/USDe/USDsui get $1.00, everything else `null`). The two
// endpoints have separate rate limits and price-list responses are cached
// in-process for `CACHE_TTL_MS`, so the second call is frequently a hot
// hit. The `source` field on the returned portfolio surfaces the final
// path so callers can decide whether to badge "approximate" totals.
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
      // [v0.50.3] Pass apiKey through so the RPC fallback can still use the
      // BlockVision price-list endpoint to USD-price non-stables. Without
      // this, a transient `/account/coins` failure (429, 5xx, network) would
      // silently zero out every non-stable holding in the wallet view —
      // exactly the regression that surfaced under the v0.50.1 burst.
      const degraded = await fetchPortfolioFromSuiRpc(address, apiKey, fallbackRpcUrl);
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
  apiKey: string | undefined,
  fallbackRpcUrl?: string,
): Promise<AddressPortfolio> {
  const walletCoins = await fetchWalletCoins(address, fallbackRpcUrl).catch((err) => {
    console.warn('[blockvision-prices] sui rpc coin fetch failed:', err);
    return [];
  });

  // [v0.50.3] When the BV `/account/coins` endpoint is unavailable
  // (typically a 429 burst, sometimes a 5xx) we still hit the BV
  // `/coin/price/list` endpoint to USD-price non-stable holdings. The two
  // endpoints have separate rate limits and price-list responses are
  // cached for `CACHE_TTL_MS`, so this is cheap and frequently a hot hit.
  // If price-list ALSO fails (e.g. true BV outage) we degrade further to
  // stables-only, which matches the v0.50.2 behaviour. Net effect: one
  // more chance to recover from a BV blip before the wallet shows $0.
  const nonStableCoinTypes = walletCoins
    .map((c) => c.coinType)
    .filter((coinType) => !(coinType in STABLE_USD_PRICES));
  const livePrices =
    apiKey && apiKey.trim().length > 0 && nonStableCoinTypes.length > 0
      ? await fetchTokenPrices(nonStableCoinTypes, apiKey).catch((err) => {
          console.warn('[blockvision-prices] price-list fallback failed:', err);
          return {} as Record<string, { price: number; change24h?: number }>;
        })
      : {};

  const coins: PortfolioCoin[] = walletCoins.map((c) => {
    const stablePrice = STABLE_USD_PRICES[c.coinType] ?? null;
    const livePrice = livePrices[c.coinType]?.price ?? null;
    const price = stablePrice ?? livePrice;
    const amount = Number(c.totalBalance) / 10 ** c.decimals;
    const usdValue = price != null && Number.isFinite(amount) ? amount * price : null;
    return {
      coinType: c.coinType,
      symbol: c.symbol,
      decimals: c.decimals,
      balance: c.totalBalance,
      price,
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
// [v0.50.2] DeFi portfolio aggregation
//
// `balance_check` historically returned only wallet coins + NAVI savings,
// missing DeFi positions across the rest of Sui DeFi — for active users
// this can be a meaningful fraction of net worth.
//
// v0.50 introduced parallel fan-out across BlockVision's
// `/account/defiPortfolio` endpoint (excluding NAVI, which is already
// covered by `positionFetcher` / NAVI MCP). v0.50.1 expanded to all 26
// supported protocols, but 26 simultaneous BV calls + the wallet
// `/account/coins` call hit BlockVision's per-second burst cap, so the
// wallet endpoint occasionally 429'd and silently degraded to Sui RPC
// (which only prices stables, leaving non-stables at $0). v0.50.2 walks
// it back to 9 protocols — the original 6 majors plus the 3 native-token
// stakings users were missing — keeping the burst at 10 parallel calls
// (1 wallet + 9 DeFi). Adding a future protocol is a 1-line append in
// `DEFI_PROTOCOLS` below.
//
// Two-pass design:
//
//   1. Generic shape walker — recursively walks the response tree,
//      extracting paired-LP shapes (coinTypeA/B + balance, with X/Y and
//      tokenX/Y aliases) and single-coin shapes (coinType +
//      balance/amount/value), automatically handling Scallop's pre-USD
//      totals, NAVI's `type: 'Supply'|'Borrow'` flag, and parent-key debt
//      detection (`borrows`, `debt`, `borrowings` → subtract). Skips
//      `rewards` / `fees` / `pendingRewards` branches to avoid double-
//      counting incentives.
//
//   2. Bespoke shims for shapes the walker can't infer (implied coin types):
//      - bluefin: usdcVault/blueVault expose `{amount}` with implied coin type
//      - haedal: stakings expose `{sui_amount}` with implied SUI
//      - suistake / walrus / suins-staking: stakings of an implied native
//        token (SUI / WAL / NS); walker can't guess the coin type from
//        a bare `{amount}` field
//
// Pricing: callers pass a `priceHints` map (typically derived from the
// wallet portfolio's coin prices). Coin types that appear in DeFi
// positions but not in the wallet (e.g. one half of an LP that the user
// doesn't otherwise hold) are looked up via a single batched
// `fetchTokenPrices` call. STABLE_USD_PRICES short-circuits stables.
//
// Failure isolation: a 5xx for one protocol drops just that protocol. The
// `source` field on the result surfaces 'partial' when any protocol failed.
//
// Concurrency: 9 parallel BV calls per balance_check + 1 wallet coins
// call = 10 simultaneous, comfortably below BV Pro-tier burst caps.
// Cache TTL 60s dedupes repeated balance_check calls for the same address
// inside a chat session.
// ---------------------------------------------------------------------------

const DEFI_PORTFOLIO_TIMEOUT_MS = 4_000;
const DEFI_CACHE_TTL_MS = 60_000;

// [v0.50.2] 9 protocols — the v0.50 majors (Cetus/Suilend/Scallop/Bluefin/
// Aftermath/Haedal) plus three native-token stakings (Suistake/SuiNS-staking/
// Walrus). v0.50.1 expanded to all 26 BlockVision protocols, but the resulting
// 26-call burst caused the wallet `/account/coins` endpoint to occasionally
// 429, falling back to Sui-RPC degraded mode where non-stables are unpriced
// — so wallet display showed $0 for users with MANIFEST/FAITH/etc. holdings.
// 9 protocols = 9+1 burst per balance_check, comfortably below BV burst
// caps. Walker + bespoke shims stay as-is — adding a future protocol is a
// 1-line append here. Deliberately excludes NAVI (already covered by
// `savings_info` via positionFetcher / NAVI MCP — including would
// double-count savings).
const DEFI_PROTOCOLS = [
  'aftermath',
  'bluefin',
  'cetus',
  'haedal',
  'scallop',
  'suilend',
  'suins-staking',
  'suistake',
  'walrus',
] as const;
type DefiProtocol = (typeof DEFI_PROTOCOLS)[number];

// Implied coin types for protocols whose response shape buries the coin
// identity in the protocol's own conventions (no `coinType` field).
const SUI_TYPE_FULL =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const USDC_TYPE_FULL =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const BLUE_TYPE_FULL =
  '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE';
const WAL_TYPE_FULL =
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL';
const NS_TYPE_FULL =
  '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS';

export interface DefiSummary {
  /** Net USD value of all aggregated DeFi positions (supply + collateral - debt). */
  totalUsd: number;
  /** Per-protocol breakdown for cards / debugging. Only protocols with non-zero value are present. */
  perProtocol: Partial<Record<DefiProtocol, number>>;
  pricedAt: number;
  /**
   * `blockvision` — every protocol in `DEFI_PROTOCOLS` responded successfully.
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

      // Pass 2 — run the per-protocol normaliser. Bespoke handlers cover
      // the protocols the walker can't infer (implied coin types, nested
      // phantomType); everything else falls through to the generic walker.
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
          const usd = normalizeProtocol(proto, s.value, prices);
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

// ---------------------------------------------------------------------------
// Shape extraction — generic walker
//
// Recursively walks a protocol's response and sums net USD value, handling
// the common shape patterns BlockVision returns:
//
//   - Paired LPs: {coinTypeA, coinTypeB, balanceA, balanceB} with X/Y and
//     tokenX/Y aliases (Cetus/Bluefin/Haedal/Steamm/Turbos/Magma/Ferra/
//     FlowX/Kriya/Momentum/BlueMove); decimals can be at sibling
//     (coinTypeADecimals, decimalsA) or nested (coinA.decimals).
//   - Single-coin: {coinType, amount/balance/value, decimals?} with
//     `type: 'Borrow'` flag for NAVI-style flat lists.
//   - Pre-USD totals: Scallop's totalSupplyValue / totalDebtValue /
//     totalCollateralValue / totalLockedScaValue at root.
//
// Debt detection happens in two ways: the parent key (`borrows`, `debt`,
// `borrowings` → flips debtSide for the entire subtree) OR the item's own
// `type` field set to `'Borrow'` (NAVI flat list).
//
// Reward / fee branches (`rewards`, `fees`, `pendingRewards`, etc.) are
// skipped entirely — those amounts are typically already implicit in the
// position's principal value, and double-counting them inflates net worth.
// Power users rarely have unclaimed-reward stacks worth >1% of their LP.
// ---------------------------------------------------------------------------

const PAIR_A_COIN_KEYS = ['coinTypeA', 'coinTypeX', 'tokenXType'] as const;
const PAIR_B_COIN_KEYS = ['coinTypeB', 'coinTypeY', 'tokenYType'] as const;
const PAIR_A_AMOUNT_KEYS = [
  'balanceA',
  'amountA',
  'coinAmountA',
  'coinAAmount',
  'coinTypeAAmount',
  'tokenXBalance',
  'tokenXAmount',
  'amountX',
  'valueA',
] as const;
const PAIR_B_AMOUNT_KEYS = [
  'balanceB',
  'amountB',
  'coinAmountB',
  'coinBAmount',
  'coinTypeBAmount',
  'tokenYBalance',
  'tokenYAmount',
  'amountY',
  'valueB',
] as const;
const PAIR_A_DECIMALS_KEYS = ['coinTypeADecimals', 'tokenXDecimals', 'decimalsA'] as const;
const PAIR_B_DECIMALS_KEYS = ['coinTypeBDecimals', 'tokenYDecimals', 'decimalsB'] as const;

const SINGLE_COIN_KEYS = ['coinType', 'depositToken', 'token'] as const;
const SINGLE_AMOUNT_KEYS = ['amount', 'balance', 'value', 'equity'] as const;
const SINGLE_DECIMALS_KEYS = ['decimals', 'decimal', 'coinDecimals'] as const;

const DEBT_KEYS = new Set([
  'borrow',
  'borrows',
  'debt',
  'debts',
  'borrowings',
  'borrowedpools',
]);
// Skip reward/fee/incentive subtrees so we don't double-count pending yield
// already implied by the position principal value.
const SKIP_KEYS = new Set([
  'rewards',
  'reward',
  'fees',
  'fee',
  'pendingrewards',
  'incentiveinfos',
  'feereward',
  'incentivereward',
]);

function isCoinTypeString(v: unknown): v is string {
  if (typeof v !== 'string' || !v.includes('::')) return false;
  // Accept both `0x…::module::TYPE` and unprefixed `…::module::TYPE`
  // (Typus's `depositToken` / `rewardsToken` omit the leading `0x`).
  return v.startsWith('0x') || /^[0-9a-fA-F]/.test(v);
}

function ensure0xPrefix(coinType: string): string {
  return coinType.startsWith('0x') ? coinType : '0x' + coinType;
}

function isAmountValue(v: unknown): v is string | number {
  return (
    (typeof v === 'string' && v.trim().length > 0) ||
    (typeof v === 'number' && Number.isFinite(v))
  );
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function pickField<T>(
  obj: Record<string, unknown>,
  keys: readonly string[],
  predicate: (v: unknown) => v is T,
): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (predicate(v)) return v;
  }
  return undefined;
}

function nestedDecimals(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  if (typeof obj.decimals === 'number') return obj.decimals;
  return undefined;
}

/**
 * Convert a BlockVision amount field to a human-readable token quantity.
 * BlockVision is inconsistent across protocols:
 *   - integer string ("229380000000") or integer number (1485) → raw,
 *     divide by 10^decimals
 *   - decimal-string ("4.240927787") or non-integer JS number (4.24) →
 *     already human-readable, return as-is
 */
function toHumanQuantity(raw: string | number, decimalsHint: number | undefined): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    if (!Number.isInteger(raw)) return raw;
    if (decimalsHint != null) return raw / 10 ** decimalsHint;
    return raw;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  if (trimmed.includes('.') || trimmed.includes('e') || trimmed.includes('E')) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  const dec = decimalsHint ?? 9;
  return n / 10 ** dec;
}

function priceFor(coinType: string, prices: Record<string, number>): number {
  const prefixed = ensure0xPrefix(coinType);
  const norm = normalizeCoinType(prefixed);
  return prices[norm] ?? prices[prefixed] ?? prices[coinType] ?? STABLE_USD_PRICES[norm] ?? 0;
}

function toUsd(
  coinType: string,
  raw: unknown,
  decimalsHint: number | undefined,
  prices: Record<string, number>,
): number {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) return 0;
  if (typeof raw === 'string' && raw.trim().length === 0) return 0;
  const prefixed = ensure0xPrefix(coinType);
  const decimals =
    typeof decimalsHint === 'number' ? decimalsHint : getDecimalsForCoinType(prefixed);
  const human = toHumanQuantity(raw, decimals);
  if (!Number.isFinite(human)) return 0;
  return human * priceFor(prefixed, prices);
}

interface ExtractedPair {
  coinTypeA: string;
  amountA: string | number;
  decimalsA: number | undefined;
  coinTypeB: string;
  amountB: string | number;
  decimalsB: number | undefined;
}

function extractPair(obj: Record<string, unknown>): ExtractedPair | null {
  const coinTypeA = pickField(obj, PAIR_A_COIN_KEYS, isCoinTypeString);
  const coinTypeB = pickField(obj, PAIR_B_COIN_KEYS, isCoinTypeString);
  if (!coinTypeA || !coinTypeB) return null;
  const amountA = pickField(obj, PAIR_A_AMOUNT_KEYS, isAmountValue);
  const amountB = pickField(obj, PAIR_B_AMOUNT_KEYS, isAmountValue);
  if (amountA == null || amountB == null) return null;
  const decimalsA =
    pickField(obj, PAIR_A_DECIMALS_KEYS, isFiniteNumber) ??
    nestedDecimals(obj.coinA);
  const decimalsB =
    pickField(obj, PAIR_B_DECIMALS_KEYS, isFiniteNumber) ??
    nestedDecimals(obj.coinB);
  return { coinTypeA, amountA, decimalsA, coinTypeB, amountB, decimalsB };
}

interface ExtractedSingle {
  coinType: string;
  amount: string | number;
  decimals: number | undefined;
  isBorrow: boolean;
}

function extractSingle(obj: Record<string, unknown>): ExtractedSingle | null {
  const coinType = pickField(obj, SINGLE_COIN_KEYS, isCoinTypeString);
  if (!coinType) return null;
  const amount = pickField(obj, SINGLE_AMOUNT_KEYS, isAmountValue);
  if (amount == null) return null;
  const decimals = pickField(obj, SINGLE_DECIMALS_KEYS, isFiniteNumber);
  const isBorrow = obj.type === 'Borrow';
  return { coinType, amount, decimals, isBorrow };
}

function walkProtocolResponse(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  let total = 0;
  walk(result, false);
  return total;

  function walk(node: unknown, debtSide: boolean): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, debtSide);
      return;
    }
    const obj = node as Record<string, unknown>;

    // Scallop pre-USD totals (root-level only, but cheap to check anywhere).
    if (typeof obj.totalSupplyValue === 'number') total += obj.totalSupplyValue;
    if (typeof obj.totalCollateralValue === 'number') total += obj.totalCollateralValue;
    if (typeof obj.totalLockedScaValue === 'number') total += obj.totalLockedScaValue;
    if (typeof obj.totalDebtValue === 'number') total -= obj.totalDebtValue;

    const pair = extractPair(obj);
    if (pair) {
      const a = toUsd(pair.coinTypeA, pair.amountA, pair.decimalsA, prices);
      const b = toUsd(pair.coinTypeB, pair.amountB, pair.decimalsB, prices);
      total += debtSide ? -(a + b) : a + b;
    } else {
      const single = extractSingle(obj);
      if (single) {
        const usd = toUsd(single.coinType, single.amount, single.decimals, prices);
        total += debtSide || single.isBorrow ? -usd : usd;
      }
    }

    for (const [k, v] of Object.entries(obj)) {
      const lk = k.toLowerCase();
      if (SKIP_KEYS.has(lk)) continue;
      const childDebt = debtSide || DEBT_KEYS.has(lk);
      walk(v, childDebt);
    }
  }
}

/**
 * Walks the response object recursively and collects every string value at
 * any key that looks like a Sui coin-type field. Used to discover which
 * token prices we still need to fetch before normalisers run. Coin types
 * may be returned without the `0x` prefix (Typus); we normalize before
 * adding so the price-cache key matches subsequent lookups.
 */
function collectCoinTypes(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectCoinTypes(x, out);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string' && isCoinTypeString(v)) {
      const lk = k.toLowerCase();
      if (
        lk.includes('cointype') ||
        lk === 'tokenxtype' ||
        lk === 'tokenytype' ||
        lk === 'deposittoken' ||
        lk === 'rewardstoken' ||
        lk === 'token' ||
        lk === 'coinaddress' ||
        lk === 'phantomtype' ||
        lk === 'typename'
      ) {
        out.add(ensure0xPrefix(v));
      }
    } else if (typeof v === 'object' && v !== null) {
      collectCoinTypes(v, out);
    }
  }
}

// ---------------------------------------------------------------------------
// Bespoke handlers — protocols whose shape the generic walker can't infer
// (implied coin types or non-standard amount/decimals nesting).
// ---------------------------------------------------------------------------

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
      total += toUsd(lp.coinTypeA, lp.coinAmountA, undefined, prices);
    }
    if (lp.coinTypeB && lp.coinAmountB != null) {
      total += toUsd(lp.coinTypeB, lp.coinAmountB, undefined, prices);
    }
  }
  // Vaults expose a raw `amount` without a coinType — usdcVault implies USDC
  // (6dp) and blueVault implies BLUE (9dp) per the BlockVision schema.
  if (data.usdcVault?.amount != null) {
    total += toUsd(USDC_TYPE_FULL, data.usdcVault.amount, 6, prices);
  }
  if (data.blueVault?.amount != null) {
    total += toUsd(BLUE_TYPE_FULL, data.blueVault.amount, 9, prices);
  }
  return total;
}

function normalizeHaedal(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.haedal as {
      lps?: Array<{
        coinTypeA?: string;
        coinTypeB?: string;
        balanceA?: number | string;
        balanceB?: number | string;
      }>;
      stakings?: Array<{ sui_amount?: number | string }>;
    }) ?? {};
  let total = 0;
  for (const lp of data.lps ?? []) {
    if (lp.coinTypeA && lp.balanceA != null) {
      total += toUsd(lp.coinTypeA, lp.balanceA, undefined, prices);
    }
    if (lp.coinTypeB && lp.balanceB != null) {
      total += toUsd(lp.coinTypeB, lp.balanceB, undefined, prices);
    }
  }
  for (const stake of data.stakings ?? []) {
    if (stake.sui_amount != null) {
      total += toUsd(SUI_TYPE_FULL, stake.sui_amount, 9, prices);
    }
  }
  return total;
}

interface BareStaking {
  amount?: number | string;
  sui_amount?: number | string;
}

function sumBareStakings(
  data: { stakings?: BareStaking[] } | undefined,
  impliedCoinType: string,
  decimals: number,
  prices: Record<string, number>,
): number {
  if (!data) return 0;
  let total = 0;
  for (const s of data.stakings ?? []) {
    const amt = s.sui_amount ?? s.amount;
    if (amt != null) total += toUsd(impliedCoinType, amt, decimals, prices);
  }
  return total;
}

function normalizeSuistake(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data = result.suistake as { stakings?: BareStaking[] } | undefined;
  return sumBareStakings(data, SUI_TYPE_FULL, 9, prices);
}

function normalizeWalrus(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data = result.walrus as { stakings?: BareStaking[] } | undefined;
  return sumBareStakings(data, WAL_TYPE_FULL, 9, prices);
}

function normalizeSuinsStaking(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  // BlockVision may expose this under either `suins-staking`, `suinsStaking`,
  // or `suins_staking` — probe all three since the doc uses the kebab form
  // for the protocol param but JS conventions tend to camelCase response keys.
  const data =
    (result['suins-staking'] as { stakings?: BareStaking[] } | undefined) ??
    (result.suinsStaking as { stakings?: BareStaking[] } | undefined) ??
    (result.suins_staking as { stakings?: BareStaking[] } | undefined);
  return sumBareStakings(data, NS_TYPE_FULL, 6, prices);
}

const BESPOKE_NORMALIZERS: Partial<
  Record<DefiProtocol, (result: Record<string, unknown>, prices: Record<string, number>) => number>
> = {
  bluefin: normalizeBluefin,
  haedal: normalizeHaedal,
  suistake: normalizeSuistake,
  walrus: normalizeWalrus,
  'suins-staking': normalizeSuinsStaking,
};

function normalizeProtocol(
  protocol: DefiProtocol,
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const bespoke = BESPOKE_NORMALIZERS[protocol];
  if (bespoke) return bespoke(result, prices);
  return walkProtocolResponse(result, prices);
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
