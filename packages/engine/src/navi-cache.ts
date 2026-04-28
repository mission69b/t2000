// ---------------------------------------------------------------------------
// NaviCacheStore — pluggable cache backend for NAVI MCP composite reads
// ---------------------------------------------------------------------------
//
// Why this module exists
// ----------------------
// PR 4 of the scaling spec adds a 30s cache for `savings_info` and
// `health_check` reads, and a 5-minute cache for `rates_info`. Without
// it, every `savings_info` / `health_check` call in a chat turn issues
// 2–4 NAVI MCP round-trips (~200–500ms each). At 500 DAU sustained, this
// puts visible pressure on NAVI's endpoint and adds 400–1000ms of tail
// latency to those tools every turn.
//
// The cache is keyed by `navi:<endpoint>:<address>` for address-scoped
// reads and `navi:rates` for the global rates table:
//   - `navi:savings:<address>` — 30s TTL
//   - `navi:health:<address>`  — 30s TTL
//   - `navi:rates`             — 300s (5 min) TTL
//
// The default `InMemoryNaviCacheStore` is per-process (CLI/tests/dev).
// Audric injects `UpstashNaviCacheStore` at engine init via
// `init-engine-stores.ts` so all Vercel instances share one cache.
//
// Store contract
// --------------
// The store is a dumb typed key-value with TTL. Cache freshness logic
// (when to re-fetch, when to serve stale) lives in the FETCHER so
// implementations can be swapped without re-implementing policy. `get`
// returns `null` on miss, expiry, or backend error. `set` swallows errors.
// ---------------------------------------------------------------------------

/** Cache entry shape. `cachedAt` is the wall-clock ms at write time. */
export interface NaviCacheEntry {
  data: unknown;
  /** Wall-clock ms when the entry was written. Used by callers for freshness math. */
  cachedAt: number;
}

/**
 * Pluggable cache backend for NAVI MCP reads.
 *
 * All methods are async to accommodate Redis-backed implementations.
 * `get` must return `null` (not throw) on backend failure.
 * `set` must swallow errors.
 */
export interface NaviCacheStore {
  get(key: string): Promise<NaviCacheEntry | null>;
  set(key: string, entry: NaviCacheEntry, ttlSec: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — default for CLI, tests, and pre-injection use
// ---------------------------------------------------------------------------

export class InMemoryNaviCacheStore implements NaviCacheStore {
  private readonly store = new Map<string, { entry: NaviCacheEntry; expiresAt: number }>();

  async get(key: string): Promise<NaviCacheEntry | null> {
    const slot = this.store.get(key);
    if (!slot) return null;
    if (Date.now() >= slot.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return slot.entry;
  }

  async set(key: string, entry: NaviCacheEntry, ttlSec: number): Promise<void> {
    this.store.set(key, {
      entry,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Module-level injection slot
// ---------------------------------------------------------------------------

let activeStore: NaviCacheStore = new InMemoryNaviCacheStore();

/** Swap the active NAVI cache store. Called once at engine init by Audric. */
export function setNaviCacheStore(store: NaviCacheStore): void {
  activeStore = store;
}

/** Returns the currently active store. Used by navi-reads.ts. */
export function getNaviCacheStore(): NaviCacheStore {
  return activeStore;
}

/** Restore the default in-memory store. Used by test teardowns. */
export function resetNaviCacheStore(): void {
  activeStore = new InMemoryNaviCacheStore();
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

/** 30s TTL for address-scoped reads (savings, health). */
export const NAVI_ADDR_TTL_SEC = 30;

/** 300s (5 min) TTL for the global rates table. */
export const NAVI_RATES_TTL_SEC = 300;

export const naviKey = {
  rates: () => 'navi:rates',
  savings: (address: string) => `navi:savings:${address.toLowerCase()}`,
  health: (address: string) => `navi:health:${address.toLowerCase()}`,
} as const;
