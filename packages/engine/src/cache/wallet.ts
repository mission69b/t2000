// ---------------------------------------------------------------------------
// WalletCacheStore — pluggable cache backend for `fetchAddressPortfolio`
// ---------------------------------------------------------------------------
//
// Why this module exists
// ----------------------
// Pre-v0.55 the wallet portfolio cache was a process-local
// `Map<string, PortfolioCacheEntry>` inside `blockvision-prices.ts`.
// That mirrored the pre-v0.54 DeFi situation exactly: it worked for
// the CLI and single-instance dev servers but broke the SSOT promise
// on Vercel where every API route runs in its own serverless function
// with its own process. `/api/portfolio` and `balance_check` could
// observe different wallet states for the same address during a
// BlockVision 429 burst — one route had a healthy cache hit, another
// freshly degraded to `sui-rpc-degraded` (which can't price
// non-stables), so the same chat turn rendered different totals on
// different cards.
//
// PR 1+2 of the scaling spec closes the loop by mirroring the v0.54
// DeFi cache pattern verbatim. The default `InMemoryWalletCacheStore`
// preserves the legacy behavior for the CLI / tests / dev. Audric
// injects an Upstash-backed implementation at engine init so all
// routes/instances share one cache.
//
// Sticky-positive write semantics live in the FETCHER (not the store)
// so the store stays a dumb key-value with TTL. That keeps the
// contract small and lets callers swap stores freely without
// re-implementing policy.
//
// Stale tolerance
// ---------------
// The store TTL is the **sticky window** (default 30 minutes), not
// the fresh-data window. Freshness is computed by the fetcher from
// the entry's `pricedAt` against source-specific thresholds:
//   - `blockvision`        — fresh for 60s  → fully successful, trust it
//   - `sui-rpc-degraded`   — fresh for 15s  → BV unavailable, retry sooner
// If a fresh fetch returns `sui-rpc-degraded`, the fetcher serves the
// last positive `blockvision` value (up to 30 minutes old) instead of
// overwriting — same sticky-positive contract as DeFi. The cache
// entry's `pricedAt` is preserved so a UI consumer can render
// "last refresh Nm ago" if it wants to caveat the staleness.
// ---------------------------------------------------------------------------

import type { AddressPortfolio } from '../blockvision-prices.js';

/** Cache entry stored under each address key. */
export interface WalletCacheEntry {
  data: AddressPortfolio;
  /**
   * Wall-clock ms when this entry was WRITTEN to the cache — used by
   * the fetcher to compute freshness.
   *
   * Distinct from `data.pricedAt` (the upstream-data timestamp from
   * BlockVision / Sui RPC). Mirrors `DefiCacheEntry.pricedAt` for
   * cross-pattern consistency.
   */
  pricedAt: number;
}

/**
 * Pluggable cache backend.
 *
 * All methods are async because Redis-backed implementations are
 * inherently async; the in-memory impl wraps in resolved promises.
 *
 * Implementations MUST tolerate transport errors gracefully — `get`
 * should return `null` (not throw) on backend failure so the fetcher
 * falls through to a fresh BlockVision read instead of erroring the
 * whole `balance_check` call. `set` should swallow errors (logging is
 * fine) so a Redis hiccup doesn't break a successful read.
 */
export interface WalletCacheStore {
  /** Returns the cached entry, or `null` if not found / expired / backend error. */
  get(address: string): Promise<WalletCacheEntry | null>;

  /** Writes an entry with a TTL in seconds. Errors are swallowed (logged). */
  set(address: string, entry: WalletCacheEntry, ttlSec: number): Promise<void>;

  /** Removes the entry for an address. Errors are swallowed. */
  delete(address: string): Promise<void>;

  /** Removes all entries. Used by tests and `clearPortfolioCache()`. */
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — default for CLI, tests, and pre-injection use
// ---------------------------------------------------------------------------

/**
 * Process-local cache backed by a `Map`. Used as the default when no
 * other store has been injected via `setWalletCacheStore()`.
 *
 * NOT suitable for multi-instance deployments — each Vercel function
 * instance gets its own Map, which causes the SSOT divergence this
 * module exists to fix. Audric replaces this at engine init with an
 * Upstash-backed store; the CLI and MCP server keep it.
 *
 * Address normalization: keys are lowercased to match the
 * `UpstashWalletCacheStore.key()` convention. Sui addresses are
 * case-insensitive after the `0x` prefix in practice; keying by
 * lowercase prevents accidental cache misses from `0xABC...` vs
 * `0xabc...` callers (e.g. one route normalizes, another doesn't).
 */
export class InMemoryWalletCacheStore implements WalletCacheStore {
  private readonly store = new Map<string, { entry: WalletCacheEntry; expiresAt: number }>();

  async get(address: string): Promise<WalletCacheEntry | null> {
    const slot = this.store.get(address.toLowerCase());
    if (!slot) return null;
    if (Date.now() >= slot.expiresAt) {
      this.store.delete(address.toLowerCase());
      return null;
    }
    return slot.entry;
  }

  async set(address: string, entry: WalletCacheEntry, ttlSec: number): Promise<void> {
    this.store.set(address.toLowerCase(), {
      entry,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  async delete(address: string): Promise<void> {
    this.store.delete(address.toLowerCase());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Module-level injection slot
// ---------------------------------------------------------------------------

let activeStore: WalletCacheStore = new InMemoryWalletCacheStore();

/**
 * Swap the active wallet cache store. Call once at engine init from a
 * runtime that wants a non-default backend (e.g. Audric injecting
 * `UpstashWalletCacheStore`). Idempotent — calling again replaces the
 * previous store, but does NOT migrate entries; warm cache is lost on
 * swap. Tests use this to inject a fake/spy store and
 * `resetWalletCacheStore()` to restore the in-memory default.
 */
export function setWalletCacheStore(store: WalletCacheStore): void {
  activeStore = store;
}

/** Returns the currently active store. Used by `fetchAddressPortfolio`. */
export function getWalletCacheStore(): WalletCacheStore {
  return activeStore;
}

/** Restore the default in-memory store. Used by test teardowns. */
export function resetWalletCacheStore(): void {
  activeStore = new InMemoryWalletCacheStore();
}
