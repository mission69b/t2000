// ---------------------------------------------------------------------------
// BlockVision cache-clear helpers — admin / test utilities for nuking the
// wallet + DeFi + price-map caches.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT.
//
// All five clear functions are PUBLIC. They are imported by:
//   - the post-write refresh path (`engine.ts` `runPostWriteRefresh`)
//   - test setup / teardown
//   - external admin tooling
//
// The functions touch:
//   - the pluggable cache stores (Redis in prod via injection,
//     in-memory in CLI/tests by default)
//   - the in-process inflight Maps that live alongside the fetchers
//     (we call into the owning module's internal helpers rather than
//     re-implementing them here, to keep the inflight state private)
// ---------------------------------------------------------------------------

import { getDefiCacheStore } from '../cache/defi.js';
import { getWalletCacheStore } from '../cache/wallet.js';
import { _clearDefiInflightAll, _clearDefiInflightFor } from './defi/index.js';
import {
  _clearPortfolioInflightAll,
  _clearPortfolioInflightFor,
} from './wallet.js';
import { _clearPriceMapCacheInternal } from './prices.js';

export async function clearDefiCache(): Promise<void> {
  // Clears both the active store (Redis or in-memory) and any
  // in-flight promises. Async because store.clear() may need to
  // round-trip to Redis. Existing callers (tests, post-write refresh)
  // were sync and didn't await — we keep the promise return so new
  // callers can await but legacy fire-and-forget still works.
  await getDefiCacheStore().clear();
  _clearDefiInflightAll();
}

export async function clearDefiCacheFor(address: string): Promise<void> {
  await getDefiCacheStore().delete(address);
  _clearDefiInflightFor(address);
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
  _clearPortfolioInflightAll();
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
  _clearPortfolioInflightFor(address);
}

export function clearPriceMapCache(): void {
  _clearPriceMapCacheInternal();
}
