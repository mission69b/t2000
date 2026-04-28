// ---------------------------------------------------------------------------
// DefiCacheStore — pluggable cache backend for `fetchAddressDefiPortfolio`
// ---------------------------------------------------------------------------
//
// Why this module exists
// ----------------------
// Pre-v0.54 the DeFi cache was a process-local `Map<string, DefiCacheEntry>`
// inside `blockvision-prices.ts`. That worked for the CLI and for
// single-instance dev servers, but it broke the SSOT promise on Vercel
// where every API route runs in its own serverless function with its own
// process. Three readers (`balance_check` tool, `/api/portfolio` route,
// `/api/analytics/portfolio-history` route) running on three Vercel
// instances produced three independent cache states for the same address,
// so during a BlockVision burst the user saw three different totals on the
// same chat turn (e.g. $36,991 from balance_check, $36,992 from the
// timeline canvas, $29,514 from the full-portfolio canvas). This is the
// exact divergence the SSOT refactor was meant to eliminate.
//
// The fix
// -------
// `fetchAddressDefiPortfolio` now reads/writes through this `DefiCacheStore`
// interface. The default `InMemoryDefiCacheStore` preserves the legacy
// behavior for the CLI / tests / dev. Audric injects an Upstash-backed
// implementation at engine init so all routes/instances share one cache.
//
// Sticky-positive write semantics live in the FETCHER (not the store) so
// the store stays a dumb key-value with TTL. That keeps the contract small
// and lets callers swap stores freely without re-implementing policy.
//
// Stale tolerance
// ---------------
// The store TTL is the **sticky window** (default 30 minutes), not the
// fresh-data window. Freshness is computed by the fetcher from the entry's
// `pricedAt` against source-specific thresholds:
//   - `blockvision`     — fresh for 60s  → fully successful, trust it
//   - `partial`         — fresh for 15s  → some protocols 429'd, retry sooner
//   - `partial-stale`   — fresh for 0s   → always re-fetch in the background
//   - `degraded`        — never cached   → no value to serve
// If a fresh fetch returns degraded/partial-zero, the fetcher serves the
// last positive cached value (up to 30 minutes old) marked as
// `partial-stale` — "this is the most recent real number we've seen, but
// BlockVision is currently unreachable, so the canvas/UI can decide
// whether to render it as-is or with a 'last refresh Nm ago' caveat."
// ---------------------------------------------------------------------------

import type { DefiSummary } from './blockvision-prices.js';

/** Cache entry stored under each address key. */
export interface DefiCacheEntry {
  data: DefiSummary;
  /** Wall-clock ms when this was written — used by the fetcher to compute freshness. */
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
export interface DefiCacheStore {
  /** Returns the cached entry, or `null` if not found / expired / backend error. */
  get(address: string): Promise<DefiCacheEntry | null>;

  /** Writes an entry with a TTL in seconds. Errors are swallowed (logged). */
  set(address: string, entry: DefiCacheEntry, ttlSec: number): Promise<void>;

  /** Removes the entry for an address. Errors are swallowed. */
  delete(address: string): Promise<void>;

  /** Removes all entries. Used by tests and `clearDefiCache()`. */
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — default for CLI, tests, and pre-injection use
// ---------------------------------------------------------------------------

/**
 * Process-local cache backed by a `Map`. Used as the default when no
 * other store has been injected via `setDefiCacheStore()`.
 *
 * NOT suitable for multi-instance deployments — each Vercel function
 * instance gets its own Map, which causes the SSOT divergence this
 * module exists to fix. Audric replaces this at engine init with an
 * Upstash-backed store; the CLI keeps it.
 */
export class InMemoryDefiCacheStore implements DefiCacheStore {
  private readonly store = new Map<string, { entry: DefiCacheEntry; expiresAt: number }>();

  async get(address: string): Promise<DefiCacheEntry | null> {
    const slot = this.store.get(address.toLowerCase());
    if (!slot) return null;
    if (Date.now() >= slot.expiresAt) {
      this.store.delete(address.toLowerCase());
      return null;
    }
    return slot.entry;
  }

  async set(address: string, entry: DefiCacheEntry, ttlSec: number): Promise<void> {
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

let activeStore: DefiCacheStore = new InMemoryDefiCacheStore();

/**
 * Swap the active DeFi cache store. Call once at engine init from a
 * runtime that wants a non-default backend (e.g. Audric injecting
 * `RedisDefiCacheStore`). Idempotent — calling again replaces the
 * previous store, but does NOT migrate entries; warm cache is lost
 * on swap. Tests use this to inject a fake/spy store and `resetDefiCacheStore()`
 * to restore the in-memory default.
 */
export function setDefiCacheStore(store: DefiCacheStore): void {
  activeStore = store;
}

/** Returns the currently active store. Used by `fetchAddressDefiPortfolio`. */
export function getDefiCacheStore(): DefiCacheStore {
  return activeStore;
}

/** Restore the default in-memory store. Used by test teardowns. */
export function resetDefiCacheStore(): void {
  activeStore = new InMemoryDefiCacheStore();
}
