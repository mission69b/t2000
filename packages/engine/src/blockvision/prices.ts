// ---------------------------------------------------------------------------
// BlockVision token-price fetcher — multi-coin USD quotes with chunking
// and a tiny in-process price-map cache.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT, no behavior change. Every
// previous import continues to work via the re-export shim at
// `packages/engine/src/blockvision-prices.ts`.
//
// What lives here:
//   - `STABLE_USD_PRICES`     — the canonical $1.00 allow-list (also
//                               consumed by wallet.ts + defi/index.ts +
//                               defi/walker.ts for short-circuit pricing)
//   - `fetchTokenPrices`      — public multi-token price API
//   - `_clearPriceMapCache`   — internal admin helper (admin.ts re-export)
//
// Module-level state (`priceMapCache`) is a per-process Map used for
// merge-on-miss semantics: a request for 10 coins where 8 are already
// cached fetches the missing 2, not the full 10.
// ---------------------------------------------------------------------------

import { normalizeCoinType } from '@t2000/sdk';
import {
  BLOCKVISION_BASE,
  fetchBlockVisionWithRetry,
  parseNumberOrNull,
} from './retry.js';

const PRICES_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 60_000;

// BlockVision caps `tokenIds` at 10. Internal callers (engine-factory, the
// `token_prices` LLM tool, the DeFi fill-missing-prices step) may request
// more — we chunk transparently.
const PRICE_LIST_CHUNK = 10;

/**
 * Hardcoded $1.00 allow-list for the canonical Sui stablecoins. Used in
 * three places:
 *   1. `fetchTokenPrices` short-circuit — the LLM rarely needs to quote
 *      USDC/USDT against an external feed, and skipping the network call
 *      saves ~200–400ms p50 per balance render.
 *   2. Sui-RPC degraded fallback inside `fetchAddressPortfolio` — when
 *      BlockVision is unavailable, stables still resolve to USD so the
 *      visible "$X total" doesn't suddenly read $0.
 *   3. DeFi `priceFor` lookup — same short-circuit, in the walker.
 *
 * Coverage rationale: the four native Sui stables (USDC/USDT/USDe/USDsui)
 * plus the two Wormhole-bridged variants present in legacy wallets. We
 * intentionally do NOT include long-tail "USD*" tokens — depeg risk is
 * real (e.g. Frax, sUSD) and a stale $1.00 on a depegged asset is more
 * misleading than `null`.
 */
export const STABLE_USD_PRICES: Readonly<Record<string, number>> = {
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': 1,
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': 1,
  '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE': 1,
  '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI': 1,
  '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN': 1,
  '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': 1,
};

interface PriceMapCacheEntry {
  prices: Record<string, { price: number; change24h?: number }>;
  ts: number;
}
let priceMapCache: PriceMapCacheEntry | null = null;

interface BlockVisionPriceListResponse {
  code: number;
  message: string;
  result?: {
    prices?: Record<string, string>;
    coin24HChange?: Record<string, string>;
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
  // [SPEC 8 v0.5.1 B3.2] See `fetchAddressPortfolio` for the retry-stats
  // contract.
  opts: { retryStats?: { attemptCount: number } } = {},
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

  const fetched = await fetchPricesFromBlockVision(stillMissing, apiKey, opts.retryStats);
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
  retryStats?: { attemptCount: number },
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
    const signal = AbortSignal.timeout(PRICES_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchBlockVisionWithRetry(
        url,
        {
          headers: { 'x-api-key': apiKey, accept: 'application/json' },
          signal,
        },
        { signal, retryStats },
      );
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

/**
 * Internal helper for `admin.clearPriceMapCache`. Not exported from the
 * package — admin.ts is the public surface.
 */
export function _clearPriceMapCacheInternal(): void {
  priceMapCache = null;
}
