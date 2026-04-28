import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressPortfolio,
  fetchTokenPrices,
  clearPortfolioCache,
  clearPortfolioCacheFor,
  clearPriceMapCache,
} from '../blockvision-prices.js';

// [v1.4 BlockVision] Six cases mandated by the v1.4.1 spec:
//   1. BlockVision happy path
//   2. 5xx → Sui-RPC degraded fallback
//   3. Missing API key → Sui-RPC degraded fallback
//   4. Hardcoded stables surface in degraded mode
//   5. Cache TTL — second call within window returns cached payload
//   6. Hardcoded-stable shortcut in `fetchTokenPrices` (no network call)

const ADDRESS = '0xdeadbeefcafe';
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';
// [v0.47.1] BlockVision's `/coin/price/list` only returns SUI under its
// fully-normalized 64-hex coin type. Tests must mock the long form to
// faithfully exercise the normalization path.
const SUI_TYPE_LONG = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const NAVX_TYPE = '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX';

const realFetch = globalThis.fetch;

// [PR 1 — v0.55] `clearPortfolioCache()` is async — it awaits the
// underlying store (Redis-backed in production). Tests use the
// in-memory default store which clears synchronously underneath, but
// the async signature means we must await to avoid `portfolioInflight`
// state leaking across cases via the unflushed microtask continuation.
beforeEach(async () => {
  await clearPortfolioCache();
  clearPriceMapCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

type FetchInput = Parameters<typeof fetch>[0];

function mockJsonResponse(json: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response;
}

function urlOf(input: FetchInput): string {
  return typeof input === 'string' ? input : input.toString();
}

function isBlockVisionHost(input: FetchInput): boolean {
  try {
    const u = new URL(urlOf(input));
    return u.hostname === 'api.blockvision.org';
  } catch {
    return false;
  }
}

describe('blockvision-prices — fetchAddressPortfolio', () => {
  it('1) happy path — parses BlockVision /account/coins payload into PortfolioCoin shape', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      expect(url).toContain('/sui/account/coins');
      expect(url).toContain('account=' + encodeURIComponent(ADDRESS));
      return mockJsonResponse({
        code: 200,
        message: 'OK',
        result: {
          coins: [
            {
              coinType: SUI_TYPE,
              name: 'SUI',
              symbol: 'SUI',
              decimals: 9,
              balance: '1000000000',
              verified: true,
              usdValue: '3.50',
              price: '3.50',
              objects: 1,
            },
            {
              coinType: USDC_TYPE,
              name: 'USDC',
              symbol: 'USDC',
              decimals: 6,
              balance: '5000000',
              verified: true,
              usdValue: '5.00',
              price: '1.00',
              objects: 1,
            },
          ],
          usdValue: '8.50',
        },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const portfolio = await fetchAddressPortfolio(ADDRESS, 'test-key');
    expect(portfolio.source).toBe('blockvision');
    expect(portfolio.coins).toHaveLength(2);
    expect(portfolio.coins[0].symbol).toBe('SUI');
    expect(portfolio.coins[0].price).toBeCloseTo(3.5);
    expect(portfolio.coins[0].usdValue).toBeCloseTo(3.5);
    expect(portfolio.coins[1].symbol).toBe('USDC');
    expect(portfolio.totalUsd).toBeCloseTo(8.5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('2) 5xx on BOTH BV endpoints → falls back to Sui-RPC + hardcoded stables (source = sui-rpc-degraded)', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      if (isBlockVisionHost(input)) {
        return new Response('upstream', { status: 503 }) as unknown as Response;
      }
      // Sui RPC fallback — return a USDC + SUI wallet
      return mockJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [
          { coinType: USDC_TYPE, totalBalance: '7000000', coinObjectCount: 1 },
          { coinType: SUI_TYPE, totalBalance: '2000000000', coinObjectCount: 1 },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const portfolio = await fetchAddressPortfolio(ADDRESS, 'test-key', 'https://rpc.local');
    expect(portfolio.source).toBe('sui-rpc-degraded');
    const usdc = portfolio.coins.find((c) => c.coinType === USDC_TYPE);
    expect(usdc?.price).toBe(1);
    expect(usdc?.usdValue).toBeCloseTo(7);
    const sui = portfolio.coins.find((c) => c.coinType === SUI_TYPE);
    expect(sui?.price).toBeNull();
    expect(sui?.usdValue).toBeNull();
  });

  it('2b) [v0.50.3] 5xx on /account/coins ONLY → price-list endpoint still USD-prices non-stables', async () => {
    // Regression guard: pre-v0.50.3 the RPC fallback was stables-only, so a
    // transient `/account/coins` failure (typical 429 burst behavior) would
    // silently zero out every non-stable holding. The fix wires the BV
    // `/coin/price/list` endpoint through the fallback path — it has a
    // separate rate limit and is cached — so SUI/MANIFEST/etc still resolve.
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('/sui/account/coins')) {
        return new Response('rate limited', { status: 429 }) as unknown as Response;
      }
      if (url.includes('/sui/coin/price/list')) {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: { prices: { [SUI_TYPE_LONG]: '3.5' } },
        });
      }
      // Sui RPC — coin list
      return mockJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [
          { coinType: USDC_TYPE, totalBalance: '7000000', coinObjectCount: 1 },
          { coinType: SUI_TYPE, totalBalance: '2000000000', coinObjectCount: 1 },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const portfolio = await fetchAddressPortfolio(ADDRESS, 'test-key', 'https://rpc.local');
    expect(portfolio.source).toBe('sui-rpc-degraded');
    const usdc = portfolio.coins.find((c) => c.coinType === USDC_TYPE);
    expect(usdc?.price).toBe(1);
    expect(usdc?.usdValue).toBeCloseTo(7);
    // SUI now resolves via /coin/price/list fallback (was null pre-v0.50.3).
    const sui = portfolio.coins.find((c) => c.coinType === SUI_TYPE);
    expect(sui?.price).toBeCloseTo(3.5);
    expect(sui?.usdValue).toBeCloseTo(7);
    expect(portfolio.totalUsd).toBeCloseTo(14);
  });

  it('2c) [v0.50.3] /account/coins 429 + /coin/price/list also fails → graceful degrade to stables-only', async () => {
    // Worst case: a true BlockVision outage. Both endpoints fail. The
    // wallet still resolves with stables priced at $1.00 — same as
    // pre-v0.50.3 — non-stables drop to `null` USD. Net effect: the
    // hardening can only IMPROVE outcomes, never regress them.
    const fetchMock = vi.fn(async (input: FetchInput) => {
      if (isBlockVisionHost(input)) {
        return new Response('upstream', { status: 503 }) as unknown as Response;
      }
      return mockJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [
          { coinType: USDC_TYPE, totalBalance: '5000000', coinObjectCount: 1 },
          { coinType: NAVX_TYPE, totalBalance: '5000000000', coinObjectCount: 1 },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const portfolio = await fetchAddressPortfolio(ADDRESS, 'test-key', 'https://rpc.local');
    expect(portfolio.source).toBe('sui-rpc-degraded');
    const usdc = portfolio.coins.find((c) => c.coinType === USDC_TYPE);
    expect(usdc?.price).toBe(1);
    expect(usdc?.usdValue).toBeCloseTo(5);
    const navx = portfolio.coins.find((c) => c.coinType === NAVX_TYPE);
    expect(navx?.price).toBeNull();
    expect(navx?.usdValue).toBeNull();
  });

  it('3) missing apiKey → degraded mode without ever calling BlockVision', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      expect(url).not.toContain('blockvision.org');
      return mockJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [
          { coinType: USDC_TYPE, totalBalance: '1000000', coinObjectCount: 1 },
        ],
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const portfolio = await fetchAddressPortfolio(ADDRESS, undefined, 'https://rpc.local');
    expect(portfolio.source).toBe('sui-rpc-degraded');
    expect(portfolio.coins).toHaveLength(1);
    expect(portfolio.coins[0].price).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4) hardcoded stables map surfaces in degraded mode', async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [
          { coinType: USDC_TYPE, totalBalance: '1500000', coinObjectCount: 1 },
          { coinType: NAVX_TYPE, totalBalance: '5000000000', coinObjectCount: 1 },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const portfolio = await fetchAddressPortfolio(ADDRESS, '', 'https://rpc.local');
    expect(portfolio.source).toBe('sui-rpc-degraded');
    const usdc = portfolio.coins.find((c) => c.coinType === USDC_TYPE);
    const navx = portfolio.coins.find((c) => c.coinType === NAVX_TYPE);
    expect(usdc?.price).toBe(1);
    expect(usdc?.usdValue).toBeCloseTo(1.5);
    expect(navx?.price).toBeNull();
    expect(navx?.usdValue).toBeNull();
  });

  it('5) cache TTL — second call within window does not hit the network', async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
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
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const a = await fetchAddressPortfolio(ADDRESS, 'test-key');
    const b = await fetchAddressPortfolio(ADDRESS, 'test-key');
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('7) clearPortfolioCacheFor(address) forces a fresh fetch (post-write invalidation hook)', async () => {
    // Regression guard for the v1.4 post-write cache gap: pre-v1.4 the
    // post-write refresh path got fresh balances for free because
    // `fetchWalletCoins` (Sui RPC) had no cache. v1.4 introduced
    // `fetchAddressPortfolio`'s 60s module cache; without explicit
    // per-address invalidation the post-write `balance_check` returns
    // the cached pre-write snapshot. `clearPortfolioCacheFor` is called
    // by `engine.runPostWriteRefresh` immediately before the 1.5s
    // Sui-RPC-indexer-lag delay so the next BlockVision call
    // unconditionally hits the network.
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
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
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchAddressPortfolio(ADDRESS, 'test-key');
    await clearPortfolioCacheFor(ADDRESS);
    await fetchAddressPortfolio(ADDRESS, 'test-key');

    // Two real network calls — the cache was busted between them.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('8) clearPortfolioCacheFor only clears the targeted address', async () => {
    const OTHER = '0xfeedface';
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const account = url.includes(ADDRESS.slice(2)) ? ADDRESS : OTHER;
      return mockJsonResponse({
        code: 200,
        message: 'OK',
        result: {
          coins: [
            {
              coinType: SUI_TYPE,
              symbol: 'SUI',
              decimals: 9,
              balance: account === ADDRESS ? '1000000000' : '2000000000',
              price: '3.50',
              usdValue: account === ADDRESS ? '3.50' : '7.00',
            },
          ],
          usdValue: account === ADDRESS ? '3.50' : '7.00',
        },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const a = await fetchAddressPortfolio(ADDRESS, 'test-key');
    const other = await fetchAddressPortfolio(OTHER, 'test-key');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await clearPortfolioCacheFor(ADDRESS);

    const aAgain = await fetchAddressPortfolio(ADDRESS, 'test-key');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(aAgain).not.toBe(a);

    const otherAgain = await fetchAddressPortfolio(OTHER, 'test-key');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(otherAgain).toBe(other);
  });
});

describe('blockvision-prices — fetchTokenPrices', () => {
  it('6) hardcoded-stable shortcut — USDC/USDT resolve to $1.00 without hitting BlockVision', async () => {
    // BlockVision echoes the LONG form of whatever coinType we sent. The
    // engine normalizes inputs before the request and remaps the response
    // back to the caller's input shape — so the test mock returns the long
    // form, but the result must still be keyed by the caller's input.
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        code: 200,
        message: 'OK',
        result: {
          prices: { [SUI_TYPE_LONG]: '3.5' },
          coin24HChange: { [SUI_TYPE_LONG]: '1.2345' },
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const prices = await fetchTokenPrices([USDC_TYPE, SUI_TYPE], 'test-key');
    expect(prices[USDC_TYPE]).toEqual({ price: 1 });
    // Caller passed SUI_TYPE (short form) so the result is keyed by it,
    // even though BlockVision returned the long form internally.
    expect(prices[SUI_TYPE]).toEqual({ price: 3.5, change24h: 1.2345 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[FetchInput]>;
    expect(calls.length).toBe(1);
    const url = urlOf(calls[0][0]);
    // The URL contains the LONG form (what BlockVision actually accepts),
    // not the short form the caller passed.
    expect(url).toContain(encodeURIComponent(SUI_TYPE_LONG));
    expect(url).not.toContain(encodeURIComponent(USDC_TYPE));
  });

  // [v0.47.1] Three regression guards for the SUI short-form normalization
  // fix. Pre-fix, BlockVision's `/coin/price/list` silently returned an
  // empty `prices` map for `0x2::sui::SUI`, leaving the `token_prices`
  // tool, `wallet-balance` route, and engine-factory price seeding all
  // returning $0 for SUI even on Pro tier.

  it('9) SUI short form ⇄ BlockVision long form: caller-keyed response, long-form URL', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      // Engine must send the LONG form — short form returns empty prices.
      expect(url).toContain(encodeURIComponent(SUI_TYPE_LONG));
      expect(url).not.toMatch(/tokenIds=0x2::sui::SUI(?:[^0-9a-zA-Z]|$)/);
      return mockJsonResponse({
        code: 200,
        message: 'OK',
        result: {
          prices: { [SUI_TYPE_LONG]: '0.95256' },
          coin24HChange: { [SUI_TYPE_LONG]: '-2.34' },
        },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const prices = await fetchTokenPrices([SUI_TYPE], 'test-key');
    // Result must be keyed by the SHORT form the caller passed.
    expect(prices[SUI_TYPE]).toEqual({ price: 0.95256, change24h: -2.34 });
    expect(prices[SUI_TYPE_LONG]).toBeUndefined();
  });

  it('10) SUI long form passed by caller — identity mapping, no double-fetch', async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        code: 200,
        message: 'OK',
        result: { prices: { [SUI_TYPE_LONG]: '0.95' } },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const prices = await fetchTokenPrices([SUI_TYPE_LONG], 'test-key');
    expect(prices[SUI_TYPE_LONG]).toEqual({ price: 0.95 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('11) cache shared across short + long form on subsequent calls', async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        code: 200,
        message: 'OK',
        result: { prices: { [SUI_TYPE_LONG]: '0.95' } },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const a = await fetchTokenPrices([SUI_TYPE], 'test-key');
    expect(a[SUI_TYPE]?.price).toBe(0.95);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call passes the LONG form. Cache stores by long form so this
    // hits the cache rather than the network — proves the two forms are
    // interchangeable from the cache's perspective.
    const b = await fetchTokenPrices([SUI_TYPE_LONG], 'test-key');
    expect(b[SUI_TYPE_LONG]?.price).toBe(0.95);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
