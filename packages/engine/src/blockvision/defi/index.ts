// ---------------------------------------------------------------------------
// BlockVision DeFi portfolio aggregator — fan-out across 9 protocols,
// price fill, normalise, source-aware sticky-positive cache.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT.
//
// What lives here:
//   - `DefiSummary`                  — public read shape
//   - `fetchAddressDefiPortfolio`    — public read API
//   - Bounded-concurrency fan-out    — `mapWithConcurrency` (+ test alias)
//   - Source-aware cache + sticky-positive write rules
//   - Cross-instance lock around the whole fan-out
//   - `_clearDefiInflight*`          — internal helpers for admin.ts
//
// Module-level state:
//   - `defiInflight`        — in-process coalescer Map
//   - `warnedMissingApiKey` — one-shot log guard
// ---------------------------------------------------------------------------

import { normalizeCoinType } from '@t2000/sdk';
import {
  getDefiCacheStore,
  type DefiCacheEntry,
  type DefiCacheStore,
} from '../../cache/defi.js';
import { awaitOrFetch } from '../../cross-instance-lock.js';
import { getTelemetrySink } from '../../telemetry.js';
import { STABLE_USD_PRICES, fetchTokenPrices } from '../prices.js';
import {
  DEFI_PROTOCOLS,
  DEFI_PROTOCOL_CONCURRENCY,
  type DefiProtocol,
} from './protocols.js';
import { normalizeProtocol } from './normalizers.js';
import { fetchOneDefiProtocol } from './one-protocol.js';
import { collectCoinTypes } from './walker.js';

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
// `DEFI_PROTOCOLS` (see `./protocols.ts`).
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
// Concurrency: bounded at `DEFI_PROTOCOL_CONCURRENCY` (3) — see
// `./protocols.ts` for the burst-cap reasoning. Cache TTL 60s dedupes
// repeated balance_check calls for the same address inside a chat
// session.
// ---------------------------------------------------------------------------

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

/** Lock keyspace prefix for cross-instance fan-out coalescing. */
const DEFI_LOCK_KEY = (address: string) => `bv-lock:defi:${address.toLowerCase()}`;

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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      const myIdx = nextIdx;
      nextIdx += 1;
      if (myIdx >= items.length) return;
      try {
        const value = await fn(items[myIdx], myIdx);
        results[myIdx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[myIdx] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// Exported for tests + downstream throttle benchmarking. Not part of the
// public engine API surface; reserve the right to inline this if a
// dedicated concurrency utility lands later.
export const __internal_mapWithConcurrency = mapWithConcurrency;

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
 * follower (poll loop). Mirrors the wallet `safeWalletStoreGet`.
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
// bug at server boot via `apps/web-v2/lib/env.ts`. This warn-and-degrade
// path remains because the engine package is also consumed by the CLI,
// MCP server, and other hosts that may not have the same gate, AND the
// SDK form of `balance_check` accepts the apiKey as a runtime parameter
// — degrading visibly is the right behavior when a caller passes blank.
let warnedMissingApiKey = false;

export async function fetchAddressDefiPortfolio(
  address: string,
  apiKey: string | undefined,
  priceHints: Record<string, number> = {},
  // [SPEC 8 v0.5.1 B3.2] See `fetchAddressPortfolio` for the retry-stats
  // contract.
  opts: { retryStats?: { attemptCount: number } } = {},
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

          // [S18-F4] Bounded-concurrency fan-out — see protocols.ts for
          // the rationale + trade-off table.
          const settled = await mapWithConcurrency(
            DEFI_PROTOCOLS,
            (p) => fetchOneDefiProtocol(address, p, apiKey, opts.retryStats),
            DEFI_PROTOCOL_CONCURRENCY,
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

/**
 * Internal helpers for `admin.clearDefiCache` / `admin.clearDefiCacheFor`.
 * Lets the admin module reset the in-process inflight map without
 * breaking module encapsulation.
 */
export function _clearDefiInflightAll(): void {
  defiInflight.clear();
}
export function _clearDefiInflightFor(address: string): void {
  defiInflight.delete(address);
}
