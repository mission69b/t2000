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
const NAVX_TYPE = '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX';

const realFetch = globalThis.fetch;

beforeEach(() => {
  clearPortfolioCache();
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

  it('2) 5xx → falls back to Sui-RPC + hardcoded stables (source = sui-rpc-degraded)', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('blockvision.org')) {
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
    clearPortfolioCacheFor(ADDRESS);
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

    clearPortfolioCacheFor(ADDRESS);

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
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        code: 200,
        message: 'OK',
        result: {
          prices: { [SUI_TYPE]: '3.5' },
          coin24HChange: { [SUI_TYPE]: '1.2345' },
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const prices = await fetchTokenPrices([USDC_TYPE, SUI_TYPE], 'test-key');
    expect(prices[USDC_TYPE]).toEqual({ price: 1 });
    expect(prices[SUI_TYPE]).toEqual({ price: 3.5, change24h: 1.2345 });
    // Network call only happened for SUI (not for USDC, the stable).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[FetchInput]>;
    expect(calls.length).toBe(1);
    const url = urlOf(calls[0][0]);
    expect(url).toContain(encodeURIComponent(SUI_TYPE));
    expect(url).not.toContain(encodeURIComponent(USDC_TYPE));
  });
});
