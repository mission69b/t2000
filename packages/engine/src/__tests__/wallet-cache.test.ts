// ---------------------------------------------------------------------------
// [PR 1 — v0.55] Wallet-cache regression suite
// ---------------------------------------------------------------------------
//
// Pins the wallet-half of the SSOT cache contract. Mirrors `defi-cache-sticky.test.ts`
// for `fetchAddressPortfolio` and `WalletCacheStore`.
//
// What this prevents (the bug class):
// Pre-PR-1, wallet portfolio data lived in a module-local `Map<string, ...>`
// inside `blockvision-prices.ts`. Each Vercel function instance had its own
// copy, so on a hot turn the same address could be served three different
// totals from three different routes (balance_check / portfolio_analysis /
// transaction_history) on the same chat turn — exactly the divergence we
// fixed for the DeFi half in v0.54.
//
// PR 1 splits the cache into a pluggable `WalletCacheStore` (Audric injects
// `UpstashWalletCacheStore`, CLI keeps in-memory) and adds the same
// source-aware freshness + sticky-positive write rules:
//
//   Source              × Total × Cached state → Expected return + cache write
//   blockvision           any    any            → return fresh, write blockvision (30min sticky TTL)
//   sui-rpc-degraded      any    no cache       → return as-is, write with 15s TTL
//   sui-rpc-degraded      any    positive       → return cached blockvision, NO overwrite
//
// Plus: InMemoryWalletCacheStore unit tests, store transport errors are
// swallowed (fetcher fails open), inflight dedup still works, and address
// lowercasing normalises keys so 0xABC… and 0xabc… share one entry.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressPortfolio,
  clearPortfolioCache,
  clearPortfolioCacheFor,
  clearPriceMapCache,
  _resetBlockVisionCircuitBreaker,
  type AddressPortfolio,
} from '../blockvision-prices.js';
import {
  setWalletCacheStore,
  resetWalletCacheStore,
  InMemoryWalletCacheStore,
  type WalletCacheStore,
} from '../wallet-cache.js';

const ADDRESS = '0xc4c4c4';
const SUI_TYPE = '0x2::sui::SUI';
const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const realFetch = globalThis.fetch;

beforeEach(async () => {
  resetWalletCacheStore();
  await clearPortfolioCache();
  clearPriceMapCache();
  _resetBlockVisionCircuitBreaker();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  resetWalletCacheStore();
});

type FetchInput = Parameters<typeof fetch>[0];

function urlOf(input: FetchInput): string {
  return typeof input === 'string' ? input : input.toString();
}

function mockJsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response;
}

/**
 * Mocks the BlockVision `/account/coins` endpoint — the happy path.
 * Returns one SUI coin worth `valueUsd` so the wallet has a non-zero total.
 */
function mockBlockVisionPortfolio(opts: { valueUsd: number }) {
  return vi.fn(async () =>
    mockJsonResponse({
      code: 200,
      message: 'OK',
      result: {
        coins: [
          {
            coinType: SUI_TYPE,
            symbol: 'SUI',
            decimals: 9,
            balance: '1000000000', // 1 SUI
            price: String(opts.valueUsd),
            usdValue: String(opts.valueUsd),
          },
        ],
        usdValue: String(opts.valueUsd),
      },
    }),
  ) as unknown as typeof fetch;
}

/**
 * Mocks BlockVision returning 429 on `/account/coins` (forcing degraded
 * Sui-RPC fallback). The Sui RPC call returns `usdcOnRpcMicro` worth of
 * USDC (which is then USD-priced via the hardcoded $1 stable shortcut),
 * so the resulting portfolio has a non-zero total in degraded mode if
 * `usdcOnRpcMicro > 0`, or zero if `usdcOnRpcMicro === 0`.
 */
function mockBlockVision429WithRpcFallback(opts: { usdcOnRpcMicro: string }) {
  return vi.fn(async (input: FetchInput) => {
    const url = urlOf(input);
    if (url.includes('/sui/account/coins')) {
      return mockJsonResponse({}, 429);
    }
    if (url.includes('/sui/coin/price/list')) {
      // Price-list also degrades — non-stables resolve to null.
      return mockJsonResponse({ code: 200, message: 'OK', result: { prices: {} } });
    }
    // Sui RPC fallback path.
    return mockJsonResponse({
      jsonrpc: '2.0',
      id: 1,
      result:
        opts.usdcOnRpcMicro === '0'
          ? []
          : [
              {
                coinType: USDC_TYPE,
                totalBalance: opts.usdcOnRpcMicro,
                coinObjectCount: 1,
              },
            ],
    });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// InMemoryWalletCacheStore — unit tests
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] InMemoryWalletCacheStore', () => {
  it('round-trips set/get for a single address', async () => {
    const store = new InMemoryWalletCacheStore();
    const entry = {
      data: {
        coins: [],
        totalUsd: 100,
        pricedAt: Date.now(),
        source: 'blockvision' as const,
      },
      pricedAt: Date.now(),
    };
    await store.set(ADDRESS, entry, 60);
    const got = await store.get(ADDRESS);
    expect(got).toEqual(entry);
  });

  it('returns null for unknown addresses', async () => {
    const store = new InMemoryWalletCacheStore();
    const got = await store.get('0xdoesnotexist');
    expect(got).toBeNull();
  });

  it('lowercases the address — 0xABC and 0xabc collide on one entry', async () => {
    // Mirrors the production bug class — Sui addresses are case-insensitive
    // hex but JS string maps treat 0xABC and 0xabc as different keys.
    // Both `WalletCacheStore` impls must normalise to lowercase for SSOT.
    const store = new InMemoryWalletCacheStore();
    const entry = {
      data: {
        coins: [],
        totalUsd: 50,
        pricedAt: Date.now(),
        source: 'blockvision' as const,
      },
      pricedAt: Date.now(),
    };
    await store.set('0xABCDEF', entry, 60);
    const got = await store.get('0xabcdef');
    expect(got).toEqual(entry);
  });

  it('honours the TTL — entries expire after the window passes', async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemoryWalletCacheStore();
      const entry = {
        data: {
          coins: [],
          totalUsd: 1,
          pricedAt: Date.now(),
          source: 'blockvision' as const,
        },
        pricedAt: Date.now(),
      };
      await store.set(ADDRESS, entry, 1); // 1 second
      expect(await store.get(ADDRESS)).toEqual(entry);
      vi.advanceTimersByTime(1_001);
      expect(await store.get(ADDRESS)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('delete removes a single address only', async () => {
    const store = new InMemoryWalletCacheStore();
    const e = (totalUsd: number) => ({
      data: { coins: [], totalUsd, pricedAt: Date.now(), source: 'blockvision' as const },
      pricedAt: Date.now(),
    });
    await store.set('0xa', e(1), 60);
    await store.set('0xb', e(2), 60);
    await store.delete('0xa');
    expect(await store.get('0xa')).toBeNull();
    expect(await store.get('0xb')).toEqual(e(2));
  });

  it('clear removes all entries', async () => {
    const store = new InMemoryWalletCacheStore();
    const e = (totalUsd: number) => ({
      data: { coins: [], totalUsd, pricedAt: Date.now(), source: 'blockvision' as const },
      pricedAt: Date.now(),
    });
    await store.set('0xa', e(1), 60);
    await store.set('0xb', e(2), 60);
    await store.clear();
    expect(await store.get('0xa')).toBeNull();
    expect(await store.get('0xb')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Source-aware freshness — read path
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] sticky-positive wallet cache — read path', () => {
  it('serves fresh blockvision entries directly from the store (no fetch)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const store = new InMemoryWalletCacheStore();
    const cached: AddressPortfolio = {
      coins: [],
      totalUsd: 1234.56,
      pricedAt: Date.now() - 5_000, // 5s old, fresh window for blockvision is 60s
      source: 'blockvision',
    };
    await store.set(ADDRESS, { data: cached, pricedAt: cached.pricedAt }, 30 * 60);
    setWalletCacheStore(store);

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(result).toEqual(cached);
    expect(callCount).toBe(0); // Cache hit — no BlockVision call
  });

  it('serves fresh sui-rpc-degraded entries directly (within 15s window)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const store = new InMemoryWalletCacheStore();
    const cached: AddressPortfolio = {
      coins: [],
      totalUsd: 50,
      pricedAt: Date.now() - 5_000, // 5s old, degraded fresh window is 15s
      source: 'sui-rpc-degraded',
    };
    await store.set(ADDRESS, { data: cached, pricedAt: cached.pricedAt }, 30 * 60);
    setWalletCacheStore(store);

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(result).toEqual(cached);
    expect(callCount).toBe(0);
  });

  it('re-fetches when sui-rpc-degraded entry is older than 15s (fresh-TTL elapsed)', async () => {
    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 100 });

    const store = new InMemoryWalletCacheStore();
    const staleDegraded: AddressPortfolio = {
      coins: [],
      totalUsd: 5, // stale degraded value
      pricedAt: Date.now() - 20_000, // 20s old > 15s degraded window
      source: 'sui-rpc-degraded',
    };
    await store.set(ADDRESS, { data: staleDegraded, pricedAt: staleDegraded.pricedAt }, 30 * 60);
    setWalletCacheStore(store);

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    // New value from fresh fetch, not the stale 5.
    expect(result.totalUsd).toBeCloseTo(100, 1);
    expect(result.source).toBe('blockvision');
  });

  it('re-fetches when blockvision entry is older than 60s (fresh-TTL elapsed)', async () => {
    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 200 });

    const store = new InMemoryWalletCacheStore();
    const staleBV: AddressPortfolio = {
      coins: [],
      totalUsd: 50,
      pricedAt: Date.now() - 70_000, // 70s old > 60s blockvision window
      source: 'blockvision',
    };
    await store.set(ADDRESS, { data: staleBV, pricedAt: staleBV.pricedAt }, 30 * 60);
    setWalletCacheStore(store);

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(result.totalUsd).toBeCloseTo(200, 1);
    expect(result.source).toBe('blockvision');
  });
});

// ---------------------------------------------------------------------------
// Sticky-positive write rules — fall back when fresh fetch is degraded
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] sticky-positive wallet cache — write rules', () => {
  it('blockvision (positive) → writes to cache, second call hits cache', async () => {
    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 100 });

    const first = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('blockvision');
    expect(first.totalUsd).toBeCloseTo(100, 1);

    // Reset fetch — any second call would 429.
    let postFirstCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      postFirstCalls++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const second = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(second).toEqual(first);
    expect(postFirstCalls).toBe(0); // Cache hit — no BV call
  });

  it('sui-rpc-degraded with NO cached fallback → returns degraded as-is, writes with short TTL', async () => {
    globalThis.fetch = mockBlockVision429WithRpcFallback({ usdcOnRpcMicro: '1000000' }); // $1 USDC

    const first = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('sui-rpc-degraded');
    expect(first.totalUsd).toBeCloseTo(1, 1);

    // Within 15s window — second call hits cache.
    let secondCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      secondCalls++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const second = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(second).toEqual(first);
    expect(secondCalls).toBe(0);
  });

  it('sui-rpc-degraded WITH cached positive blockvision → returns cached, NO overwrite', async () => {
    // Pre-seed the cache with a known-good positive blockvision entry.
    const store = new InMemoryWalletCacheStore();
    const cachedPositive: AddressPortfolio = {
      coins: [
        {
          coinType: SUI_TYPE,
          symbol: 'SUI',
          decimals: 9,
          balance: '5000000000',
          price: 3.5,
          usdValue: 17.5,
        },
      ],
      totalUsd: 7_500, // make it juicy + clearly distinguishable
      pricedAt: Date.now() - 5 * 60 * 1000, // 5min old — past fresh window, within sticky
      source: 'blockvision',
    };
    await store.set(
      ADDRESS,
      { data: cachedPositive, pricedAt: cachedPositive.pricedAt },
      30 * 60,
    );
    setWalletCacheStore(store);

    // Now BlockVision is bursting — 429s, RPC fallback returns $1 only.
    globalThis.fetch = mockBlockVision429WithRpcFallback({ usdcOnRpcMicro: '1000000' });

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    // Critical: returns the cached $7,500, not the $1 RPC fallback.
    expect(result.totalUsd).toBe(7_500);
    expect(result.source).toBe('blockvision');
    expect(result.coins[0].symbol).toBe('SUI');
    // pricedAt unchanged — UI uses this to render "last refresh Nm ago".
    expect(result.pricedAt).toBe(cachedPositive.pricedAt);

    // Cache was not overwritten — the underlying entry still has the
    // original positive blockvision data, not the freshly-fetched
    // sui-rpc-degraded one.
    const stored = await store.get(ADDRESS);
    expect(stored?.data.source).toBe('blockvision');
    expect(stored?.data.totalUsd).toBe(7_500);
  });

  it('cached positive older than sticky window (>30min) → no fallback, returns degraded', async () => {
    const store = new InMemoryWalletCacheStore();
    const tooOldPositive: AddressPortfolio = {
      coins: [],
      totalUsd: 5_000,
      pricedAt: Date.now() - 31 * 60 * 1000, // 31min old — outside 30min sticky window
      source: 'blockvision',
    };
    // Bypass the store's 30min TTL by writing with a longer TTL so we
    // can pin behaviour at the fetcher's sticky-window check independently.
    await store.set(
      ADDRESS,
      { data: tooOldPositive, pricedAt: tooOldPositive.pricedAt },
      60 * 60, // 60min TTL — entry exists in store, but fetcher should reject as too old
    );
    setWalletCacheStore(store);

    globalThis.fetch = mockBlockVision429WithRpcFallback({ usdcOnRpcMicro: '0' }); // empty

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    // Sticky window is 30min — anything older is treated as no fallback.
    expect(result.source).toBe('sui-rpc-degraded');
    expect(result.totalUsd).toBe(0);
  });

  it('blockvision overwrites a stale positive cache (latest truth wins, even if zero)', async () => {
    const store = new InMemoryWalletCacheStore();
    const oldValue: AddressPortfolio = {
      coins: [],
      totalUsd: 5_000,
      pricedAt: Date.now() - 10 * 60 * 1000,
      source: 'blockvision',
    };
    await store.set(ADDRESS, { data: oldValue, pricedAt: oldValue.pricedAt }, 30 * 60);
    setWalletCacheStore(store);

    // Fresh BV call returns $0 (positions all moved out).
    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 0 });

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    // blockvision+0 is a CONFIRMED empty state — overwrites the stale $5k.
    expect(result.source).toBe('blockvision');
    expect(result.totalUsd).toBe(0);

    const stored = await store.get(ADDRESS);
    expect(stored?.data.source).toBe('blockvision');
    expect(stored?.data.totalUsd).toBe(0);
  });

  it('sui-rpc-degraded WITH cached blockvision but cached.total === 0 → does NOT prefer cached', async () => {
    // Edge case: a cached blockvision entry with totalUsd === 0 is NOT
    // a sticky candidate (we only stick on positive values). So a fresh
    // degraded read should be returned (and written with short TTL).
    const store = new InMemoryWalletCacheStore();
    const cachedZero: AddressPortfolio = {
      coins: [],
      totalUsd: 0, // zero — not a sticky candidate
      pricedAt: Date.now() - 5 * 60 * 1000,
      source: 'blockvision',
    };
    await store.set(ADDRESS, { data: cachedZero, pricedAt: cachedZero.pricedAt }, 30 * 60);
    setWalletCacheStore(store);

    globalThis.fetch = mockBlockVision429WithRpcFallback({ usdcOnRpcMicro: '5000000' }); // $5 USDC

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(result.source).toBe('sui-rpc-degraded');
    expect(result.totalUsd).toBeCloseTo(5, 1);
  });
});

// ---------------------------------------------------------------------------
// Store transport errors — fail open
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] sticky-positive wallet cache — store error tolerance', () => {
  it('store.get throws → fetcher continues as cache miss, returns fresh result', async () => {
    const flakyStore: WalletCacheStore = {
      get: vi.fn(async () => {
        throw new Error('redis: connection reset');
      }),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    setWalletCacheStore(flakyStore);

    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 42 });

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(result.source).toBe('blockvision');
    expect(result.totalUsd).toBeCloseTo(42, 1);
    // Two `get` calls expected: the pre-lock check AND the post-lock
    // recheck inside the `awaitOrFetch` leader. Both throw and the
    // fetcher tolerates each as a cache miss, then proceeds to BV.
    expect(flakyStore.get).toHaveBeenCalledTimes(2);
    // Set was attempted (positive blockvision → write).
    expect(flakyStore.set).toHaveBeenCalledTimes(1);
  });

  it('store.set throws → fetcher returns successful result anyway (write swallowed)', async () => {
    const flakyStore: WalletCacheStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {
        throw new Error('redis: write failed');
      }),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    setWalletCacheStore(flakyStore);

    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 99 });

    const result = await fetchAddressPortfolio(ADDRESS, 'k');
    expect(result.source).toBe('blockvision');
    expect(result.totalUsd).toBeCloseTo(99, 1);
  });
});

// ---------------------------------------------------------------------------
// In-process inflight dedup — kept independently of cross-instance lock
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] sticky-positive wallet cache — inflight dedup', () => {
  it('two concurrent in-process callers with cache miss share one fetch', async () => {
    let bvCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      bvCalls++;
      // Slow response so the two callers overlap.
      await new Promise((r) => setTimeout(r, 50));
      return mockJsonResponse({
        code: 200,
        message: 'OK',
        result: {
          coins: [
            {
              coinType: SUI_TYPE,
              symbol: 'SUI',
              decimals: 9,
              balance: '1000000000',
              price: '3.50',
              usdValue: '3.50',
            },
          ],
          usdValue: '3.50',
        },
      });
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      fetchAddressPortfolio(ADDRESS, 'k'),
      fetchAddressPortfolio(ADDRESS, 'k'),
    ]);
    expect(a).toBe(b); // Same Promise → same reference
    expect(bvCalls).toBe(1); // One network round-trip, not two
  });
});

// ---------------------------------------------------------------------------
// setWalletCacheStore — injection wires through fetcher
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] setWalletCacheStore injection', () => {
  it('round-trips through the fetcher — Audric can inject Upstash impl', async () => {
    let getCalls = 0;
    let setCalls = 0;
    const probeStore: WalletCacheStore = {
      get: vi.fn(async (addr: string) => {
        getCalls++;
        // Return what we wrote — proves the fetcher reads from injected store.
        if (addr.toLowerCase() === ADDRESS.toLowerCase()) {
          return null; // first time = miss; subsequent = whatever set wrote
        }
        return null;
      }),
      set: vi.fn(async () => {
        setCalls++;
      }),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    setWalletCacheStore(probeStore);

    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 17 });

    await fetchAddressPortfolio(ADDRESS, 'k');
    // Pre-lock get + post-lock recheck = 2 reads.
    expect(getCalls).toBe(2);
    // One write of the fresh blockvision result.
    expect(setCalls).toBe(1);
  });

  it('resetWalletCacheStore restores in-memory default', async () => {
    const probeStore: WalletCacheStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    setWalletCacheStore(probeStore);
    resetWalletCacheStore();

    globalThis.fetch = mockBlockVisionPortfolio({ valueUsd: 1 });

    await fetchAddressPortfolio(ADDRESS, 'k');
    // Probe was reset before the fetch — its spies must NOT have fired.
    expect(probeStore.get).not.toHaveBeenCalled();
    expect(probeStore.set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// clearPortfolioCacheFor — async, awaited by engine.runPostWriteRefresh
// ---------------------------------------------------------------------------

describe('[PR 1 — v0.55] clearPortfolioCacheFor — async invalidation', () => {
  it('returns a Promise that resolves after the store has been mutated', async () => {
    const store = new InMemoryWalletCacheStore();
    const entry = {
      data: {
        coins: [],
        totalUsd: 1,
        pricedAt: Date.now(),
        source: 'blockvision' as const,
      },
      pricedAt: Date.now(),
    };
    await store.set(ADDRESS, entry, 60);
    setWalletCacheStore(store);

    expect(await store.get(ADDRESS)).toEqual(entry);

    // Must be awaited — without await, a Redis-backed store (via Upstash)
    // would still be mid-`DEL` when the next BV call reads.
    const result = clearPortfolioCacheFor(ADDRESS);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(await store.get(ADDRESS)).toBeNull();
  });
});
