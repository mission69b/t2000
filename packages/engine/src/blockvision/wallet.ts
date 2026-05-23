// ---------------------------------------------------------------------------
// BlockVision wallet portfolio fetcher — priced wallet read with the
// Sui-RPC degraded-mode fallback path.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT, no behavior change.
//
// What lives here:
//   - `PortfolioCoin`             — per-coin row type
//   - `AddressPortfolio`          — full wallet read shape
//   - `fetchAddressPortfolio`     — public read API with cache + lock
//   - Sticky-positive write rules — preserve last known-good positive
//                                   reads when BV bursts
//   - Sui-RPC fallback            — coin list + BV price-list ladder when
//                                   `/account/coins` is unavailable
//   - `_clearPortfolioInflight`   — internal helper for admin.ts
//
// Module-level state:
//   - `portfolioInflight`         — in-process coalescer (Map<address,Promise>)
//
// Cross-instance coalescing is handled by `awaitOrFetch` over the
// `bv-lock:wallet:<addr>` lock key (see PR 2 — v0.55 work).
// ---------------------------------------------------------------------------

import {
  getDecimalsForCoinType,
  isInRegistry,
  resolveSymbol,
} from '@t2000/sdk';
import { awaitOrFetch } from '../cross-instance-lock.js';
import {
  getWalletCacheStore,
  type WalletCacheEntry,
  type WalletCacheStore,
} from '../cache/wallet.js';
import { fetchWalletCoins } from '../sui/rpc.js';
import { getTelemetrySink } from '../telemetry.js';
import {
  BLOCKVISION_BASE,
  fetchBlockVisionWithRetry,
  parseNumberOrNull,
} from './retry.js';
import { STABLE_USD_PRICES, fetchTokenPrices } from './prices.js';

const PORTFOLIO_TIMEOUT_MS = 4_000;

// ---------------------------------------------------------------------------
// Wallet portfolio cache TTLs (PR 1+2 — v0.55)
//
// Per-source freshness for `fetchAddressPortfolio`. Mirrors the DeFi
// cache pattern (`DEFI_FRESH_TTL_MS_*`). The store TTL we pass to
// `set(address, entry, ttlSec)` is the **sticky window** (30 min) —
// we want the entry to STAY in Redis long enough that a sustained
// BV outage can keep serving the last known-good positive value
// stamped as such. Freshness is computed by the FETCHER from the
// entry's own `pricedAt`, not by the store.
//
// Why split:
//   - 60s `blockvision` — fully successful BV reply; trust it.
//   - 15s `sui-rpc-degraded` — BV unavailable, retry sooner so the
//     next caller gets a chance to recover.
//
// Pre-PR-1 the degraded TTL was emulated with the
// `ts: Date.now() - (CACHE_TTL_MS - DEGRADED_CACHE_TTL_MS)` aging
// trick at the write site. That worked under the in-process Map (TTL
// was client-checked at read time using `ts`) but silently broke
// under Redis (`EX` is server-enforced and ignores client `ts`).
// Now we pass per-source TTLs explicitly to `store.set`.
// ---------------------------------------------------------------------------
const WALLET_FRESH_TTL_MS_BLOCKVISION = 60_000;
const WALLET_FRESH_TTL_MS_DEGRADED = 15_000;
/** Sticky window — entries persist this long after their fresh window so
 *  brief BV bursts can fall back to last known-good positive. */
const WALLET_STICKY_TTL_SEC = 30 * 60;
/** Lock keyspace prefix for cross-instance fan-out coalescing. */
const WALLET_LOCK_KEY = (address: string) => `bv-lock:wallet:${address.toLowerCase()}`;

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

// [PR 1 — v0.55] The module-level `portfolioCache` Map is gone.
// Replaced by the pluggable `WalletCacheStore` (default `InMemoryWalletCacheStore`,
// Audric injects `UpstashWalletCacheStore`). See `cache/wallet.ts` for
// the why — same SSOT bug class as the v0.54 DeFi work, just on the
// wallet half. `portfolioInflight` is kept as an in-process coalescer
// so N concurrent in-process callers share one promise; cross-process
// coalescing is handled by `awaitOrFetch` in PR 2.
const portfolioInflight = new Map<string, Promise<AddressPortfolio>>();

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

/** Source-aware fresh-TTL lookup for wallet portfolio entries. */
function walletFreshTtlMs(source: AddressPortfolio['source']): number {
  switch (source) {
    case 'blockvision':
      return WALLET_FRESH_TTL_MS_BLOCKVISION;
    case 'sui-rpc-degraded':
      return WALLET_FRESH_TTL_MS_DEGRADED;
  }
}

/**
 * Store-write helper that swallows backend errors. A Redis hiccup
 * during write should never break a successful read — the next caller
 * will simply re-fetch on cache miss. Errors are logged so an outage
 * is still observable in Vercel logs. Mirrors `safeStoreSet` in the
 * DeFi half.
 */
async function safeWalletStoreSet(
  store: WalletCacheStore,
  address: string,
  entry: WalletCacheEntry,
  ttlSec: number,
): Promise<void> {
  try {
    await store.set(address, entry, ttlSec);
  } catch (err) {
    console.warn('[wallet] cache set failed (non-fatal):', err);
  }
}

/**
 * Read the wallet store, swallowing transport errors as cache misses.
 * Used by both the leader (pre-fanout check) and the follower (poll
 * loop while another instance fetches).
 */
async function safeWalletStoreGet(
  store: WalletCacheStore,
  address: string,
): Promise<WalletCacheEntry | null> {
  try {
    return await store.get(address);
  } catch (err) {
    console.warn('[wallet] cache get failed (continuing as cache miss):', err);
    return null;
  }
}

/**
 * One-shot wallet portfolio fetcher. BlockVision returns balances + USD
 * prices in a single call; on failure we degrade to a Sui-RPC coin
 * fetch with hardcoded stablecoin pricing.
 *
 * Caching shape (PR 1+2 — v0.55):
 *   1. Store-level cache (Redis in prod, in-memory in CLI/tests). Read
 *      first; if entry is fresh-for-source serve directly.
 *   2. In-process inflight Map dedupes concurrent in-process callers
 *      onto one promise.
 *   3. The leader path runs under a cross-instance lock
 *      (`bv-lock:wallet:<addr>`) so at most one Vercel instance per
 *      address is hitting BlockVision at any moment. Followers poll
 *      the store for the leader's write; if the leader dies they fall
 *      through to a direct fetch as a defensive degraded path.
 *
 * Sticky-positive write rules mirror the DeFi half:
 *   - `blockvision` (any total) → write unconditionally; latest BV
 *     truth always wins.
 *   - `sui-rpc-degraded` → write only when no fresher positive
 *     `blockvision` entry exists in the sticky window (30 min). When
 *     a positive sticky entry exists, return it as-is and DO NOT
 *     overwrite — preserves the original `pricedAt` so a UI can
 *     render "last refresh Nm ago".
 */
export async function fetchAddressPortfolio(
  address: string,
  apiKey: string | undefined,
  fallbackRpcUrl?: string,
  // [SPEC 8 v0.5.1 B3.2] Optional retry-stats counter forwarded to
  // `fetchBlockVisionWithRetry`. The dispatcher passes
  // `ctx.retryStats` here; the wrapper bumps `.attemptCount` on each
  // retry; the dispatcher reads the final value and surfaces it on
  // the `tool_result` event when > 1.
  opts: { retryStats?: { attemptCount: number } } = {},
): Promise<AddressPortfolio> {
  const store = getWalletCacheStore();

  // ---------------------------------------------------------------
  // Read path — source-aware freshness
  // ---------------------------------------------------------------
  const cachedEntry = await safeWalletStoreGet(store, address);
  if (cachedEntry) {
    const ageMs = Date.now() - cachedEntry.pricedAt;
    if (ageMs < walletFreshTtlMs(cachedEntry.data.source)) {
      getTelemetrySink().counter('bv.cache_hit', { kind: 'wallet', freshness: 'fresh' });
      return cachedEntry.data;
    }
    // Stale hit — kept in scope for the sticky-positive fallback below.
    getTelemetrySink().counter('bv.cache_hit', { kind: 'wallet', freshness: 'stale-served' });
  } else {
    getTelemetrySink().counter('bv.cache_hit', { kind: 'wallet', freshness: 'miss' });
  }

  // In-process inflight dedup. Even with a cross-instance lock, we
  // still want concurrent in-process callers to share one promise.
  const existing = portfolioInflight.get(address);
  if (existing) return existing;

  const promise = (async (): Promise<AddressPortfolio> => {
    try {
      return await awaitOrFetch<AddressPortfolio>(
        WALLET_LOCK_KEY(address),
        // ----------------------------------------------------------
        // Leader path — runs after we've won the cross-instance lock.
        // Re-checks the cache (small window where another leader on a
        // different process just wrote) before paying for the BV call.
        // ----------------------------------------------------------
        async () => {
          const recheck = await safeWalletStoreGet(store, address);
          if (recheck) {
            const ageMs = Date.now() - recheck.pricedAt;
            if (ageMs < walletFreshTtlMs(recheck.data.source)) {
              return recheck.data;
            }
          }

          // Try BlockVision first (fast path).
          if (apiKey && apiKey.trim().length > 0) {
            const blockvision = await fetchPortfolioFromBlockVision(address, apiKey, opts.retryStats);
            if (blockvision) {
              // `blockvision` always wins — latest BV truth.
              await safeWalletStoreSet(
                store,
                address,
                { data: blockvision, pricedAt: Date.now() },
                WALLET_STICKY_TTL_SEC,
              );
              return blockvision;
            }
          }

          // [v0.50.3] Pass apiKey through so the RPC fallback can
          // still use the BlockVision price-list endpoint to USD-price
          // non-stables. Without this, a transient `/account/coins`
          // failure (429, 5xx, network) would silently zero out every
          // non-stable holding in the wallet view.
          const degraded = await fetchPortfolioFromSuiRpc(address, apiKey, fallbackRpcUrl);

          // -----------------------------------------------------
          // Sticky-positive write rules (PR 1 — v0.55)
          //
          // If a positive `blockvision` entry exists within the sticky
          // window, prefer it over a fresh degraded read. This stops a
          // BV burst from poisoning the cache with a $0/missing-token
          // wallet across every Vercel instance simultaneously — the
          // exact divergence that fired three different totals on the
          // same chat turn pre-v0.54 (DeFi half) and pre-v0.55 (wallet
          // half).
          //
          // We use `recheck` (which we read inside the lock) as the
          // basis for the comparison. If `recheck` is null but the
          // pre-lock `cachedEntry` was positive within the sticky
          // window, prefer that — covers the case where the pre-lock
          // read raced a deleting writer.
          // -----------------------------------------------------
          const stickyCandidate =
            recheck && recheck.data.source === 'blockvision' && recheck.data.totalUsd > 0
              ? recheck
              : cachedEntry &&
                  cachedEntry.data.source === 'blockvision' &&
                  cachedEntry.data.totalUsd > 0
                ? cachedEntry
                : null;

          const stickyFresh =
            stickyCandidate && Date.now() - stickyCandidate.pricedAt < WALLET_STICKY_TTL_SEC * 1000;

          if (stickyFresh) {
            // Return the cached positive as-is — preserve `pricedAt` so
            // a UI consumer can decide whether to caveat staleness.
            // Do NOT overwrite the cache; the existing entry is still
            // the most truthful thing we have for this address.
            return stickyCandidate!.data;
          }

          // No sticky fallback — write the degraded result with a
          // short TTL so the next caller retries BV soon. Pre-PR-1
          // this used the `ts: Date.now() - (CACHE_TTL_MS -
          // DEGRADED_CACHE_TTL_MS)` aging trick to emulate a short
          // TTL on top of the long base TTL; under Redis's
          // server-enforced `EX` that no longer works, so we pass
          // an explicit per-source TTL instead.
          await safeWalletStoreSet(
            store,
            address,
            { data: degraded, pricedAt: Date.now() },
            Math.ceil(WALLET_FRESH_TTL_MS_DEGRADED / 1000),
          );
          return degraded;
        },
        {
          // Followers poll the wallet cache while the leader fetches.
          // Returns non-null only when the leader has written a
          // fresh-for-source entry — stale entries keep the poll going.
          pollCache: async () => {
            const e = await safeWalletStoreGet(store, address);
            if (!e) return null;
            const ageMs = Date.now() - e.pricedAt;
            return ageMs < walletFreshTtlMs(e.data.source) ? e.data : null;
          },
        },
      );
    } finally {
      portfolioInflight.delete(address);
    }
  })();

  portfolioInflight.set(address, promise);
  return promise;
}

async function fetchPortfolioFromBlockVision(
  address: string,
  apiKey: string,
  retryStats?: { attemptCount: number },
): Promise<AddressPortfolio | null> {
  const url = `${BLOCKVISION_BASE}/account/coins?account=${encodeURIComponent(address)}`;
  const signal = AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS);
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
    // [v0.55.0 Fix 1] Prefer canonical SDK symbol over the raw symbol returned
    // by BlockVision when the coin type is in COIN_REGISTRY. BlockVision can
    // return uppercase variants (e.g. 'USDSUI') that don't match the canonical
    // mixed-case symbol ('USDsui'), and downstream consumers (balance.ts
    // STABLE_SYMBOLS set + saveableUsdsui find, audric chip flows, useBalance
    // hook) all key off the canonical form. The earlier `c.symbol || resolveSymbol`
    // ordering caused saveableUsdsui to read 0 right after a USDC→USDsui swap
    // because BV's 'USDSUI' beat the registry's 'USDsui' and the find() missed.
    //
    // We use `isInRegistry` (NOT `isSupported`) on purpose: USDsui/USDe/USDT
    // are legacy/no-tier registry entries today, but they STILL have canonical
    // symbol metadata that downstream code keys off. `isSupported` would
    // exclude them and re-introduce the bug.
    //
    // For coins NOT in the registry (memecoins, long-tail tokens) we fall
    // back to whatever BV returns since it's typically more user-friendly
    // than resolveSymbol's last-segment heuristic.
    const symbol = isInRegistry(coinType)
      ? resolveSymbol(coinType)
      : c.symbol || resolveSymbol(coinType);
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
 * Internal helper for `admin.clearPortfolioCache` /
 * `admin.clearPortfolioCacheFor`. Lets the admin module reset the
 * in-process inflight map without breaking module encapsulation.
 */
export function _clearPortfolioInflightAll(): void {
  portfolioInflight.clear();
}
export function _clearPortfolioInflightFor(address: string): void {
  portfolioInflight.delete(address);
}
