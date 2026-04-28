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
import { getDefiCacheStore, type DefiCacheEntry, type DefiCacheStore } from './defi-cache.js';
import { getWalletCacheStore, type WalletCacheEntry, type WalletCacheStore } from './wallet-cache.js';
import { awaitOrFetch } from './cross-instance-lock.js';
import { getTelemetrySink } from './telemetry.js';

const BLOCKVISION_BASE = 'https://api.blockvision.org/v2/sui';
const PORTFOLIO_TIMEOUT_MS = 4_000;
const PRICES_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 60_000;

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
const DEFI_LOCK_KEY = (address: string) => `bv-lock:defi:${address.toLowerCase()}`;

// ---------------------------------------------------------------------------
// BlockVision retry policy
//
// BlockVision Pro periodically returns 429 ("rate limited") under burst
// load — both the per-second key limit AND a global edge throttle that
// can fire even when the key is well under quota. Without retry, a
// single 429 cascades through the whole stack:
//   - balance_check's wallet read degrades to Sui-RPC ($0 for long-tail)
//   - DeFi read returns degraded → falls to sticky cache (or empty)
//   - portfolio_analysis trusts the partial+0 → no DeFi line
//
// Three attempts with jittered exponential backoff (250/750/2250ms ± 25%)
// catches the typical 1–3s BV throttle window before any user-visible
// degradation happens. If BlockVision sends a `Retry-After` header we
// honor it (capped at 5s to stay inside the per-call timeout budget).
//
// Worst case: 250 + 750 = ~1s of waiting before the third (final)
// attempt. Still well inside the 4s portfolio / 3s prices / 5s defi
// per-call timeouts because each `fetch()` carries its own
// `AbortSignal.timeout()` independent of the retry sleep.
// ---------------------------------------------------------------------------
const BV_RETRY_MAX_ATTEMPTS = 3;
const BV_RETRY_BASE_DELAY_MS = 250;
const BV_RETRY_BACKOFF_FACTOR = 3;
const BV_RETRY_JITTER = 0.25;
const BV_RETRY_AFTER_CAP_MS = 5_000;

// ---------------------------------------------------------------------------
// Circuit breaker — scaling guard
//
// Naive retry amplifies BV load 3x during sustained outages. At 10k
// users that's a self-inflicted DoS — every retry burst pushes BV
// further into rate-limit territory and prolongs the outage. Solution:
// a process-local circuit breaker. After CB_THRESHOLD 429s within a
// CB_WINDOW_MS rolling window, open the circuit for CB_COOLDOWN_MS
// and treat 429s as final (no retry). This isolates retry to the
// burst case it's designed for and removes amplification during real
// outages.
//
// Per-process state is intentional — global Redis-backed coordination
// would add latency on the hot path, and each Vercel function having
// its own breaker is acceptable: at 10k users we'd have ~10–50
// concurrent function instances; each one independently learning the
// circuit is open within ~5s of the outage starting is fast enough.
//
// Tunables chosen to detect a sustained outage in <5s without
// false-positiving on momentary bursts that retry would absorb.
// ---------------------------------------------------------------------------
const CB_WINDOW_MS = 5_000;
const CB_THRESHOLD = 10;
const CB_COOLDOWN_MS = 30_000;

let cb429Timestamps: number[] = [];
let cbOpenUntil = 0;

function cbIsOpen(now: number): boolean {
  return now < cbOpenUntil;
}

function cbRecord429(now: number): void {
  cb429Timestamps.push(now);
  cb429Timestamps = cb429Timestamps.filter((t) => now - t < CB_WINDOW_MS);
  if (cb429Timestamps.length >= CB_THRESHOLD && !cbIsOpen(now)) {
    cbOpenUntil = now + CB_COOLDOWN_MS;
    getTelemetrySink().gauge('bv.cb_open', 1);
    console.warn(
      `[blockvision] circuit breaker OPEN — ${CB_THRESHOLD} 429s in ${CB_WINDOW_MS}ms, retries disabled for ${CB_COOLDOWN_MS / 1000}s`,
    );
    cb429Timestamps = [];
  }
}

/** Test seam — reset breaker state between tests. */
export function _resetBlockVisionCircuitBreaker(): void {
  cb429Timestamps = [];
  cbOpenUntil = 0;
}

interface BvRetryOpts {
  signal?: AbortSignal;
  /** Test seam — defaults to `Math.random()`. Inject a fixed RNG for deterministic tests. */
  rng?: () => number;
  /** Test seam — defaults to `setTimeout`-backed promise. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam — defaults to `Date.now()`. Inject for deterministic CB tests. */
  now?: () => number;
}

/**
 * `fetch()` with bounded retry on transient failures.
 *
 * Retries on:
 *   - HTTP 429 (rate limited) — honors `Retry-After` if present
 *   - HTTP 5xx (transient server error)
 *   - Network errors (DNS, ECONNRESET, etc.) — but NOT AbortError
 *
 * Does NOT retry on:
 *   - HTTP 4xx other than 429 (client error — won't change on retry)
 *   - AbortError from the caller's signal (caller cancelled — respect)
 *
 * Returns the final `Response` (success or last non-retryable error)
 * so existing `res.ok` / `res.status` checks at call sites continue
 * to work unchanged. Re-throws the original error only when every
 * attempt was a network error (no Response object to return).
 */
export async function fetchBlockVisionWithRetry(
  url: string,
  init: RequestInit,
  opts: BvRetryOpts = {},
): Promise<Response> {
  const rng = opts.rng ?? Math.random;
  const sleep = opts.sleep ?? ((ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      // Wire the caller's signal into the sleep so cancelling the
      // overall request aborts the retry wait too — otherwise we'd
      // burn the full backoff before noticing the caller gave up.
      if (opts.signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }));

  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < BV_RETRY_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Base wait with exponential growth: 250, 750, 2250 ms.
      let waitMs = BV_RETRY_BASE_DELAY_MS * Math.pow(BV_RETRY_BACKOFF_FACTOR, attempt - 1);
      // Honor Retry-After when the server told us to wait — capped so
      // a misbehaving header (`Retry-After: 3600`) can't stall a
      // single tool call past its per-call timeout budget.
      const retryAfter = lastResponse?.headers.get('retry-after');
      if (retryAfter) {
        const secs = Number(retryAfter);
        if (Number.isFinite(secs) && secs > 0) {
          waitMs = Math.min(secs * 1000, BV_RETRY_AFTER_CAP_MS);
        }
      }
      // Symmetric jitter (±jitterFactor) to spread out caller bursts
      // — without it, every concurrent request retries at the same
      // moment and re-creates the burst we're trying to absorb.
      const jitterPx = (rng() * 2 - 1) * BV_RETRY_JITTER * waitMs;
      const delay = Math.max(0, waitMs + jitterPx);
      try {
        await sleep(delay);
      } catch (err) {
        // Caller aborted during backoff — bail with the last error/
        // response so the caller sees the same surface as if the
        // abort had fired during fetch itself.
        if (lastResponse) return lastResponse;
        throw err;
      }
    }

    try {
      lastResponse = await fetch(url, init);
    } catch (err) {
      lastError = err;
      // Don't retry if the caller cancelled — that's intentional.
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      getTelemetrySink().counter('bv.requests', { status: 'network_err', attempt: String(attempt) });
      continue;
    }

    if (lastResponse.ok) {
      getTelemetrySink().counter('bv.requests', { status: '2xx', attempt: String(attempt) });
      return lastResponse;
    }
    // 4xx other than 429 are permanent client errors — no point retrying.
    if (lastResponse.status !== 429 && lastResponse.status < 500) {
      getTelemetrySink().counter('bv.requests', { status: String(lastResponse.status), attempt: String(attempt) });
      return lastResponse;
    }
    // Track 429s for the circuit breaker — if too many fire in a
    // short window we stop retrying and let the caller degrade
    // gracefully rather than amplifying load on an already-overloaded
    // upstream.
    if (lastResponse.status === 429) {
      getTelemetrySink().counter('bv.requests', { status: '429', attempt: String(attempt) });
      const now = (opts.now ?? Date.now)();
      cbRecord429(now);
      if (cbIsOpen(now)) {
        return lastResponse;
      }
    } else {
      getTelemetrySink().counter('bv.requests', { status: '5xx', attempt: String(attempt) });
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error('fetch failed after retries');
}
// [PR 1 — v0.55] `DEGRADED_CACHE_TTL_MS` (the v0.53.3 constant for the
// Sui-RPC fallback path's effective TTL) was removed alongside the
// `portfolioCache` Map and its `ts: Date.now() - (CACHE_TTL_MS -
// DEGRADED_CACHE_TTL_MS)` aging trick. The same effect — short retry
// window for degraded reads — now lives in `WALLET_FRESH_TTL_MS_DEGRADED`
// at the top of the file, applied as a per-source `EX` value at write
// time so Redis enforces it server-side.
//
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

// [PR 1 — v0.55] The module-level `portfolioCache` Map is gone.
// Replaced by the pluggable `WalletCacheStore` (default `InMemoryWalletCacheStore`,
// Audric injects `UpstashWalletCacheStore`). See `wallet-cache.ts` for
// the why — same SSOT bug class as the v0.54 DeFi work, just on the
// wallet half. `portfolioInflight` is kept as an in-process coalescer
// so N concurrent in-process callers share one promise; cross-process
// coalescing is handled by `awaitOrFetch` in PR 2.
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
            const blockvision = await fetchPortfolioFromBlockVision(address, apiKey);
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
      { signal },
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
    const signal = AbortSignal.timeout(PRICES_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchBlockVisionWithRetry(
        url,
        {
          headers: { 'x-api-key': apiKey, accept: 'application/json' },
          signal,
        },
        { signal },
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

/**
 * Source-aware freshness thresholds. When a cache hit has age <
 * threshold, the fetcher serves it directly without re-attempting
 * BlockVision. When age >= threshold but < `STICKY_TTL_SEC`, the entry
 * is kept around as a sticky-positive fallback (see fetcher logic).
 */
const DEFI_FRESH_TTL_MS_BLOCKVISION = 60_000; // 60s — fully successful
const DEFI_FRESH_TTL_MS_PARTIAL = 15_000; // 15s — at least one protocol failed; retry sooner
const DEFI_FRESH_TTL_MS_PARTIAL_STALE = 0; // 0s — always re-fetch in background

/**
 * [v0.54] Sticky-positive window: entries persist in the cache store
 * for this long even after their fresh-TTL has elapsed, so a brief
 * BlockVision burst that would otherwise return `partial+0` or
 * `degraded` can fall back to the last-known-good positive value
 * (marked `partial-stale` so consumers can render an honest "last
 * refresh Nm ago" caveat). 30 minutes is long enough to absorb a
 * sustained BV outage without serving wildly stale data; users hold
 * positions on the order of hours/days, so a 30-minute lag rarely
 * misleads. Tunable per-deployment via the cache store TTL.
 */
const DEFI_STICKY_TTL_SEC = 30 * 60;

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
export type DefiProtocol = (typeof DEFI_PROTOCOLS)[number];

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
   * `blockvision`    — every protocol in `DEFI_PROTOCOLS` responded successfully.
   * `partial`        — at least one protocol failed; total may under-count.
   * `partial-stale`  — fresh fetch returned degraded/partial-zero, but we have a
   *                    positive value cached within the sticky window
   *                    (`DEFI_STICKY_TTL_SEC`, default 30min). The numbers are
   *                    real, just not freshly verified — UI should caveat with
   *                    "last refresh Nm ago" so the user knows the provenance.
   *                    Introduced in v0.54 to fix cross-instance SSOT divergence
   *                    when BlockVision is bursting.
   * `degraded`       — no API key, or every protocol failed AND no sticky
   *                    fallback exists; total = 0.
   */
  source: 'blockvision' | 'partial' | 'partial-stale' | 'degraded';
}

// Process-local inflight dedup. Even with a shared cache store (Redis),
// we still want to coalesce 9 BlockVision calls when N concurrent
// callers in the same process miss the cache simultaneously — one
// fetch fans out, all callers await the same promise. The store
// handles cross-process dedup via TTL (last writer wins, but the
// sticky-positive write rules below ensure the wrong winner can't
// poison cached known-good data).
const defiInflight = new Map<string, Promise<DefiSummary>>();

/** Source-aware fresh-TTL lookup. See constants block above for rationale. */
function freshTtlForSource(source: DefiSummary['source']): number {
  switch (source) {
    case 'blockvision':
      return DEFI_FRESH_TTL_MS_BLOCKVISION;
    case 'partial':
      return DEFI_FRESH_TTL_MS_PARTIAL;
    case 'partial-stale':
      return DEFI_FRESH_TTL_MS_PARTIAL_STALE;
    case 'degraded':
      return 0;
  }
}

/**
 * Store-write helper that swallows backend errors. A Redis hiccup
 * during write should never break a successful read — the next caller
 * will simply re-fetch on cache miss. Errors are logged so an outage
 * is still observable in Vercel logs.
 */
async function safeStoreSet(
  store: DefiCacheStore,
  address: string,
  entry: DefiCacheEntry,
): Promise<void> {
  try {
    await store.set(address, entry, DEFI_STICKY_TTL_SEC);
  } catch (err) {
    console.warn('[defi] cache set failed (non-fatal):', err);
  }
}

/**
 * Read the DeFi store, swallowing transport errors as cache misses.
 * Used by both the leader (pre-fanout + post-lock recheck) and the
 * follower (poll loop). Mirrors `safeWalletStoreGet`.
 */
async function safeDefiStoreGet(
  store: DefiCacheStore,
  address: string,
): Promise<DefiCacheEntry | null> {
  try {
    return await store.get(address);
  } catch (err) {
    console.warn('[defi] cache get failed (continuing as cache miss):', err);
    return null;
  }
}

// Warn-once gate so we don't spam logs every time `balance_check` runs in a
// misconfigured environment. The first request that hits the missing-key
// guard logs a loud, scannable warning; subsequent requests stay quiet.
// Reset on process restart, which is fine — the next deploy logs again
// until the operator sets the key.
//
// Defense-in-depth note: the audric web app gates the empty-key class of
// bug at server boot via `apps/web/lib/env.ts`. This warn-and-degrade
// path remains because the engine package is also consumed by the CLI,
// MCP server, and other hosts that may not have the same gate, AND the
// SDK form of `balance_check` accepts the apiKey as a runtime parameter
// — degrading visibly is the right behavior when a caller passes blank.
let warnedMissingApiKey = false;

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
    if (!warnedMissingApiKey) {
      warnedMissingApiKey = true;
      // Loud, single-line warning so it's grep-able in log explorers.
      // BLOCKVISION_API_KEY missing OR empty string ("") — both produce
      // identical silent-zero behavior, which the v0.50 fix-it pass after
      // the audric-roadmap S.18 work surfaced as a class of bug
      // (env var present in Vercel but blank → degraded forever).
      console.warn(
        '[defi] BLOCKVISION_API_KEY missing or empty — DeFi positions will report $0 across all protocols. Set the key in your runtime env to enable Bluefin/Suilend/Cetus/etc. aggregation.',
      );
    }
    return { totalUsd: 0, perProtocol: {}, pricedAt: Date.now(), source: 'degraded' };
  }

  const store = getDefiCacheStore();

  // ---------------------------------------------------------------
  // Read path — source-aware freshness
  //
  // `cachedEntry` may be present but past its source-specific
  // freshness threshold. In that case we fall through to a fresh
  // fetch but keep the entry in scope as a sticky-positive fallback
  // (see write rules below). Store-level errors are swallowed; we
  // log and continue as if the cache were empty so a Redis hiccup
  // never breaks `balance_check`.
  // ---------------------------------------------------------------
  const cachedEntry = await safeDefiStoreGet(store, address);
  if (cachedEntry) {
    const ageMs = Date.now() - cachedEntry.pricedAt;
    const freshTtlMs = freshTtlForSource(cachedEntry.data.source);
    if (ageMs < freshTtlMs) {
      // Fresh hit — serve directly without re-fetching.
      getTelemetrySink().counter('bv.cache_hit', { kind: 'defi', freshness: 'fresh' });
      return cachedEntry.data;
    }
    // Stale hit kept in scope for the sticky-positive fallback below.
    getTelemetrySink().counter('bv.cache_hit', { kind: 'defi', freshness: 'stale-served' });
  } else {
    getTelemetrySink().counter('bv.cache_hit', { kind: 'defi', freshness: 'miss' });
  }

  let inflight = defiInflight.get(address);
  if (inflight) return inflight;

  // ---------------------------------------------------------------
  // [PR 2 — v0.55] Cross-instance coalescer wraps the WHOLE 9-protocol
  // fan-out as a single unit. Lock key is `bv-lock:defi:<addr>` —
  // distinct from the wallet lock so they don't block each other.
  //
  // IMPORTANT: the lock sits at the fan-out level, NOT around each
  // individual `fetchOneDefiProtocol` call. Per-protocol locking would
  // cause the 9 sibling protocols to compete for the same lock — one
  // would win and 8 would poll-then-refetch, completely defeating
  // coalescing.
  // ---------------------------------------------------------------
  inflight = (async () => {
    try {
      return await awaitOrFetch<DefiSummary>(
        DEFI_LOCK_KEY(address),
        // Leader path — runs after acquiring the lock.
        async () => {
          // Re-check the cache after acquiring the lock — a leader on
          // another process may have written between our pre-lock
          // miss and our lock acquisition.
          const recheck = await safeDefiStoreGet(store, address);
          if (recheck) {
            const ageMs = Date.now() - recheck.pricedAt;
            if (ageMs < freshTtlForSource(recheck.data.source)) {
              return recheck.data;
            }
          }
          // Use the freshest sticky basis we have for the write rules
          // below. Prefer `recheck` over the pre-lock `cachedEntry`
          // (covers the case where a previous leader's write expired
          // since our pre-lock read).
          const stickyBasis: DefiCacheEntry | null = recheck ?? cachedEntry;
          const fanoutAt = Date.now();

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

          const fetchedAt = Date.now();
          const summary: DefiSummary = {
            totalUsd,
            perProtocol,
            pricedAt: fetchedAt,
            source:
              failures === DEFI_PROTOCOLS.length
                ? 'degraded'
                : failures > 0
                  ? 'partial'
                  : 'blockvision',
          };

          // -------------------------------------------------------------
          // Sticky-positive write rules (v0.54 — see header for the
          // four-state truth table). `stickyBasis` was captured inside
          // the lock above so it reflects the freshest known state at
          // leader-entry time (not the pre-lock observation, which may
          // have raced a deleting writer).
          // -------------------------------------------------------------
          const cachedPositive =
            stickyBasis &&
            stickyBasis.data.totalUsd > 0 &&
            fanoutAt - stickyBasis.pricedAt < DEFI_STICKY_TTL_SEC * 1000;

          if (summary.source === 'blockvision') {
            // Fully successful — overwrites unconditionally.
            await safeStoreSet(store, address, { data: summary, pricedAt: fetchedAt });
            return summary;
          }

          if (summary.source === 'partial' && summary.totalUsd > 0) {
            // Observed real value despite a failure — write but with a
            // short fresh-TTL so the next reader retries the failing
            // protocols within 15s.
            await safeStoreSet(store, address, { data: summary, pricedAt: fetchedAt });
            return summary;
          }

          // partial+0 OR degraded — fall back to the sticky cache if we
          // have a positive entry that's fresher than 30 minutes.
          if (cachedPositive) {
            const stale: DefiSummary = {
              ...stickyBasis!.data,
              source: 'partial-stale',
            };
            // Don't write — preserve the original `pricedAt` so the UI
            // can render an honest "last refresh Nm ago" caveat.
            // Re-writing would reset the age and hide the staleness.
            return stale;
          }

          // No fallback available — return as-is, don't cache so the
          // next caller retries BlockVision.
          return summary;
        },
        {
          // Followers poll the DeFi cache while the leader fans out.
          // Returns non-null only when the leader has written a
          // fresh-for-source entry — stale entries keep the poll going.
          pollCache: async () => {
            const e = await safeDefiStoreGet(store, address);
            if (!e) return null;
            const ageMs = Date.now() - e.pricedAt;
            return ageMs < freshTtlForSource(e.data.source) ? e.data : null;
          },
        },
      );
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
  const signal = AbortSignal.timeout(DEFI_PORTFOLIO_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchBlockVisionWithRetry(
      url,
      {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal,
      },
      { signal },
    );
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

export async function clearDefiCache(): Promise<void> {
  // Clears both the active store (Redis or in-memory) and any
  // in-flight promises. Async because store.clear() may need to
  // round-trip to Redis. Existing callers (tests, post-write refresh)
  // were sync and didn't await — we keep the promise return so new
  // callers can await but legacy fire-and-forget still works.
  await getDefiCacheStore().clear();
  defiInflight.clear();
}

export async function clearDefiCacheFor(address: string): Promise<void> {
  await getDefiCacheStore().delete(address);
  defiInflight.delete(address);
}

/**
 * Wipe the wallet portfolio cache plus any in-flight promises.
 *
 * Async because the underlying store may be Redis-backed. Existing
 * fire-and-forget callers (tests, `clearDefiCache`-shape utilities)
 * still work since they just don't `await` — they get the same
 * effective "schedule the clear" behavior.
 */
export async function clearPortfolioCache(): Promise<void> {
  await getWalletCacheStore().clear();
  portfolioInflight.clear();
}

/**
 * [v1.4 — Day 2.5] Per-address invalidator.
 *
 * Engine `runPostWriteRefresh` calls this right before the 1.5s
 * Sui-RPC-indexer-lag delay so the next `fetchAddressPortfolio` for
 * the affected address is forced to hit BlockVision again instead of
 * returning the cached pre-write snapshot.
 *
 * **MUST be awaited** — pre-PR-1 the cache was a synchronous Map and
 * the `engine.ts` caller fired-and-forgot. Now the underlying store
 * is async (Upstash in production), so without `await` the next
 * `balance_check` races the Redis delete and can fetch the stale
 * pre-write balance — exactly the symptom v0.54 sticky cache shipped
 * to fix. `engine.ts` `runPostWriteRefresh` was updated to await this
 * in the same PR.
 *
 * No-op when `address` doesn't match a cached entry — cheap to call
 * unconditionally on every write.
 */
export async function clearPortfolioCacheFor(address: string): Promise<void> {
  await getWalletCacheStore().delete(address);
  portfolioInflight.delete(address);
}

export function clearPriceMapCache(): void {
  priceMapCache = null;
}
