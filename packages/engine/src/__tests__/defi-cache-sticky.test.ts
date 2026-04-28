// ---------------------------------------------------------------------------
// [v0.54] Sticky-positive cache regression suite
// ---------------------------------------------------------------------------
//
// Pins the cache write/read contract that resolves the cross-instance SSOT
// drift bug — same address served three different DeFi totals from three
// different routes on the same chat turn ($36,991 / $36,992 / $29,514)
// because each Vercel function had its own in-memory `Map`. v0.54 splits
// the cache into a pluggable `DefiCacheStore` (Audric injects Upstash, CLI
// keeps in-memory) and adds source-aware freshness + sticky-positive write
// rules so a BlockVision burst can't poison a known-good positive value
// across all readers.
//
// Test matrix:
//   Source × Total × Cached state → Expected return + cache write
//
//   blockvision   any    any         → return fresh, cache 30min
//   partial       > 0    any         → return fresh, cache 30min (15s fresh window)
//   partial       === 0  no cache    → return degraded-as-is, no cache
//   partial       === 0  positive    → return cached as 'partial-stale', no overwrite
//   degraded      any    no cache    → return as-is, no cache
//   degraded      any    positive    → return cached as 'partial-stale', no overwrite
//
// Plus: store transport errors are swallowed, inflight dedup still works,
// and `setDefiCacheStore` injection round-trips through the fetcher.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressDefiPortfolio,
  clearDefiCache,
  clearPriceMapCache,
  type DefiSummary,
} from '../blockvision-prices.js';
import {
  setDefiCacheStore,
  resetDefiCacheStore,
  InMemoryDefiCacheStore,
  type DefiCacheStore,
  type DefiCacheEntry,
} from '../defi-cache.js';

const ADDRESS = '0xc4c4c4';
const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const realFetch = globalThis.fetch;

beforeEach(async () => {
  resetDefiCacheStore();
  await clearDefiCache();
  clearPriceMapCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  resetDefiCacheStore();
});

type FetchInput = Parameters<typeof fetch>[0];

function urlOf(input: FetchInput): string {
  return typeof input === 'string' ? input : input.toString();
}

function paramOf(url: string, key: string): string | null {
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

function mockJsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response;
}

/**
 * Builds a fetch mock where `successfulProtocols` return a positive
 * Cetus-shape position worth $value, and the rest 429.
 *
 * Using `cetus` as the carrier shape because its bespoke normaliser
 * is the simplest in `BESPOKE_NORMALIZERS` — equal balanceA/balanceB
 * × USDC = $balance directly, no intermediate price lookup.
 */
function mockFetchWithSuccessfulProtocols(opts: {
  successfulProtocols: string[];
  /** Each successful protocol contributes this much in USD. */
  valuePerProtocol: number;
}) {
  return vi.fn(async (input: FetchInput) => {
    const url = urlOf(input);
    const proto = paramOf(url, 'protocol');
    if (proto && opts.successfulProtocols.includes(proto)) {
      // Cetus is the only protocol whose bespoke normaliser cleanly
      // sums two USDC legs without a price lookup; for everything
      // else use a generic walker-friendly shape.
      const balanceMicroUsdc = String(Math.round(opts.valuePerProtocol * 500_000)); // 2 legs × $X/2
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  coinTypeA: USDC_TYPE,
                  coinTypeADecimals: 6,
                  balanceA: balanceMicroUsdc,
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: balanceMicroUsdc,
                },
              ],
            },
          },
        });
      }
      // Bluefin/Suilend etc — empty result so they count as success but contribute $0.
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }
    if (proto) {
      // Failure case (429).
      return mockJsonResponse({}, 429);
    }
    return mockJsonResponse({ code: 200, message: 'OK', result: {} });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Source-aware freshness — read path
// ---------------------------------------------------------------------------

describe('[v0.54] sticky-positive cache — read path', () => {
  it('serves fresh blockvision entries directly from the store (no fetch)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const store = new InMemoryDefiCacheStore();
    const cached: DefiSummary = {
      totalUsd: 1234.56,
      perProtocol: { bluefin: 1234.56 },
      pricedAt: Date.now() - 5_000, // 5s old, fresh window is 60s
      source: 'blockvision',
    };
    await store.set(ADDRESS, { data: cached, pricedAt: cached.pricedAt }, 30 * 60);
    setDefiCacheStore(store);

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(result).toEqual(cached);
    expect(callCount).toBe(0); // Cache hit — no BlockVision call
  });

  it('serves fresh partial entries directly (within 15s window)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const store = new InMemoryDefiCacheStore();
    const cached: DefiSummary = {
      totalUsd: 500,
      perProtocol: { cetus: 500 },
      pricedAt: Date.now() - 5_000,
      source: 'partial',
    };
    await store.set(ADDRESS, { data: cached, pricedAt: cached.pricedAt }, 30 * 60);
    setDefiCacheStore(store);

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(result).toEqual(cached);
    expect(callCount).toBe(0);
  });

  it('re-fetches when partial entry is older than 15s (fresh-TTL elapsed)', async () => {
    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['cetus'],
      valuePerProtocol: 100,
    });

    const store = new InMemoryDefiCacheStore();
    const stalePartial: DefiSummary = {
      totalUsd: 50,
      perProtocol: { cetus: 50 },
      pricedAt: Date.now() - 20_000, // 20s old, partial fresh window is 15s
      source: 'partial',
    };
    await store.set(ADDRESS, { data: stalePartial, pricedAt: stalePartial.pricedAt }, 30 * 60);
    setDefiCacheStore(store);

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // New value from fresh fetch, not the stale 50.
    expect(result.totalUsd).toBeCloseTo(100, 1);
  });
});

// ---------------------------------------------------------------------------
// Sticky-positive write rules — fall back when fresh fetch is degraded
// ---------------------------------------------------------------------------

describe('[v0.54] sticky-positive cache — write rules', () => {
  it('blockvision (positive) → writes to cache, second call hits cache', async () => {
    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: [
        'aftermath',
        'bluefin',
        'cetus',
        'haedal',
        'scallop',
        'suilend',
        'suins-staking',
        'suistake',
        'walrus',
      ],
      valuePerProtocol: 100, // Only cetus contributes ($100); rest empty success.
    });

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('blockvision');
    expect(first.totalUsd).toBeCloseTo(100, 1);

    // Reset fetch so any second call would 429.
    let postFirstCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      postFirstCalls++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const second = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(second).toEqual(first);
    expect(postFirstCalls).toBe(0); // Cache hit — no BV call
  });

  it('partial (positive) → writes to cache, second call hits cache within 15s', async () => {
    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['cetus'],
      valuePerProtocol: 75,
    });

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('partial');
    expect(first.totalUsd).toBeCloseTo(75, 1);

    let postFirstCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      postFirstCalls++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    const second = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(second).toEqual(first);
    expect(postFirstCalls).toBe(0);
  });

  it('partial+0 with no cached fallback → returns degraded-shape, does NOT cache', async () => {
    // bluefin succeeds with empty (counts as success), the rest 429.
    // Net: source='partial', total=0, no positive elsewhere.
    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['bluefin'],
      valuePerProtocol: 0, // bluefin returns empty result, no LP/position
    });

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('partial');
    expect(first.totalUsd).toBe(0);

    // No write — second call must re-fetch.
    let secondCalls = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      secondCalls++;
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'bluefin') {
        return mockJsonResponse({ code: 200, message: 'OK', result: {} });
      }
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(secondCalls).toBeGreaterThan(0); // Re-fetched, not cache hit
  });

  it('partial+0 WITH cached positive fallback → returns cached as partial-stale, no overwrite', async () => {
    // Pre-seed the cache with a known-good positive value.
    const store = new InMemoryDefiCacheStore();
    const cachedPositive: DefiSummary = {
      totalUsd: 7_500,
      perProtocol: { bluefin: 7_500 },
      pricedAt: Date.now() - 5 * 60 * 1000, // 5min old — past fresh window, within sticky
      source: 'blockvision',
    };
    await store.set(
      ADDRESS,
      { data: cachedPositive, pricedAt: cachedPositive.pricedAt },
      30 * 60,
    );
    setDefiCacheStore(store);

    // Now BlockVision is bursting — bluefin 429s, scallop returns empty success.
    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['scallop'],
      valuePerProtocol: 0,
    });

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // Critical: returns the cached $7,500, not $0
    expect(result.totalUsd).toBe(7_500);
    expect(result.source).toBe('partial-stale');
    expect(result.perProtocol.bluefin).toBe(7_500);
    // pricedAt unchanged — UI uses this to render "last refresh Nm ago"
    expect(result.pricedAt).toBe(cachedPositive.pricedAt);

    // Cache was not overwritten — the underlying entry still has the
    // original positive blockvision data, not a freshly-written stale.
    const stored = await store.get(ADDRESS);
    expect(stored?.data.source).toBe('blockvision');
    expect(stored?.data.totalUsd).toBe(7_500);
  });

  it('degraded (everything 429s) WITH cached positive fallback → returns partial-stale', async () => {
    const store = new InMemoryDefiCacheStore();
    const cachedPositive: DefiSummary = {
      totalUsd: 12_345,
      perProtocol: { suilend: 12_345 },
      pricedAt: Date.now() - 10 * 60 * 1000, // 10min old
      source: 'blockvision',
    };
    await store.set(
      ADDRESS,
      { data: cachedPositive, pricedAt: cachedPositive.pricedAt },
      30 * 60,
    );
    setDefiCacheStore(store);

    // Every protocol 429s → source='degraded'
    globalThis.fetch = vi.fn(async () => mockJsonResponse({}, 429)) as unknown as typeof fetch;

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(result.totalUsd).toBe(12_345);
    expect(result.source).toBe('partial-stale');
    expect(result.pricedAt).toBe(cachedPositive.pricedAt);
  });

  it('degraded with NO cached fallback → returns degraded as-is, does not cache', async () => {
    globalThis.fetch = vi.fn(async () => mockJsonResponse({}, 429)) as unknown as typeof fetch;

    const first = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(first.source).toBe('degraded');
    expect(first.totalUsd).toBe(0);

    // No cache write — second call must re-fetch.
    let secondCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      secondCalls++;
      return mockJsonResponse({}, 429);
    }) as unknown as typeof fetch;

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(secondCalls).toBeGreaterThan(0);
  });

  it('cached positive older than sticky window (>30min) → no fallback, returns degraded', async () => {
    const store = new InMemoryDefiCacheStore();
    const tooOldPositive: DefiSummary = {
      totalUsd: 5_000,
      perProtocol: { bluefin: 5_000 },
      pricedAt: Date.now() - 31 * 60 * 1000, // 31min old — outside sticky window
      source: 'blockvision',
    };
    // Bypass the store's 30min TTL by writing with a longer TTL so we
    // can pin behavior at the fetcher's sticky-window check independently.
    await store.set(
      ADDRESS,
      { data: tooOldPositive, pricedAt: tooOldPositive.pricedAt },
      60 * 60, // 60min TTL — entry exists in store, but fetcher should reject as too old
    );
    setDefiCacheStore(store);

    globalThis.fetch = vi.fn(async () => mockJsonResponse({}, 429)) as unknown as typeof fetch;

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // Sticky window is 30min — anything older is treated as no fallback.
    expect(result.source).toBe('degraded');
    expect(result.totalUsd).toBe(0);
  });

  it('blockvision overwrites a stale positive cache (latest truth wins)', async () => {
    const store = new InMemoryDefiCacheStore();
    const oldValue: DefiSummary = {
      totalUsd: 5_000,
      perProtocol: { bluefin: 5_000 },
      pricedAt: Date.now() - 10 * 60 * 1000,
      source: 'blockvision',
    };
    await store.set(ADDRESS, { data: oldValue, pricedAt: oldValue.pricedAt }, 30 * 60);
    setDefiCacheStore(store);

    // Fresh BV call returns $0 across the board (positions closed).
    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: [
        'aftermath',
        'bluefin',
        'cetus',
        'haedal',
        'scallop',
        'suilend',
        'suins-staking',
        'suistake',
        'walrus',
      ],
      valuePerProtocol: 0,
    });

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // blockvision+0 is a CONFIRMED empty state — overwrites the stale $5k.
    expect(result.source).toBe('blockvision');
    expect(result.totalUsd).toBe(0);

    const stored = await store.get(ADDRESS);
    expect(stored?.data.source).toBe('blockvision');
    expect(stored?.data.totalUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Store transport errors — fail open
// ---------------------------------------------------------------------------

describe('[v0.54] sticky-positive cache — store error tolerance', () => {
  it('store.get throws → fetcher continues as cache miss, returns fresh result', async () => {
    const flakyStore: DefiCacheStore = {
      get: vi.fn(async () => {
        throw new Error('redis: connection reset');
      }),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    setDefiCacheStore(flakyStore);

    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['cetus'],
      valuePerProtocol: 42,
    });

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(result.source).toBe('partial');
    expect(result.totalUsd).toBeCloseTo(42, 1);
    expect(flakyStore.get).toHaveBeenCalledTimes(1);
    // Set was attempted (positive partial → write)
    expect(flakyStore.set).toHaveBeenCalledTimes(1);
  });

  it('store.set throws → fetcher returns successful result anyway (write swallowed)', async () => {
    const flakyStore: DefiCacheStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {
        throw new Error('redis: write failed');
      }),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    };
    setDefiCacheStore(flakyStore);

    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['cetus'],
      valuePerProtocol: 99,
    });

    const result = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // Write failed but read succeeded — caller gets the right answer.
    expect(result.source).toBe('partial');
    expect(result.totalUsd).toBeCloseTo(99, 1);
  });
});

// ---------------------------------------------------------------------------
// Inflight dedup — process-local coalescing
// ---------------------------------------------------------------------------

describe('[v0.54] sticky-positive cache — inflight dedup', () => {
  it('two concurrent callers with cache miss share one fanout', async () => {
    let bvCalls = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      bvCalls++;
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      // Simulate slow BV so the second caller arrives while first is in flight.
      await new Promise((r) => setTimeout(r, 50));
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  coinTypeA: USDC_TYPE,
                  coinTypeADecimals: 6,
                  balanceA: '5000000',
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: '5000000',
                },
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      fetchAddressDefiPortfolio(ADDRESS, 'k'),
      fetchAddressDefiPortfolio(ADDRESS, 'k'),
    ]);

    expect(a).toBe(b); // Same promise resolved → same reference
    // 9 BV calls (one per protocol), not 18 — inflight dedup coalesced both callers.
    expect(bvCalls).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Store injection round-trip
// ---------------------------------------------------------------------------

describe('[v0.54] setDefiCacheStore injection', () => {
  it('round-trips through the fetcher — Audric can inject Upstash impl', async () => {
    const customStore = new InMemoryDefiCacheStore();
    const setSpy = vi.spyOn(customStore, 'set');
    setDefiCacheStore(customStore);

    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['cetus'],
      valuePerProtocol: 17,
    });

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(setSpy).toHaveBeenCalledTimes(1);

    const cached = await customStore.get(ADDRESS);
    expect(cached?.data.totalUsd).toBeCloseTo(17, 1);
  });

  it('resetDefiCacheStore restores in-memory default', async () => {
    const customStore = new InMemoryDefiCacheStore();
    const customSet = vi.spyOn(customStore, 'set');
    setDefiCacheStore(customStore);
    resetDefiCacheStore();

    globalThis.fetch = mockFetchWithSuccessfulProtocols({
      successfulProtocols: ['cetus'],
      valuePerProtocol: 5,
    });

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    // Custom store not used after reset.
    expect(customSet).not.toHaveBeenCalled();
  });
});

// Re-export for the test type-check
export type { DefiCacheEntry };
