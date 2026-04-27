import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressDefiPortfolio,
  clearDefiCache,
  clearPriceMapCache,
} from '../blockvision-prices.js';

/**
 * [v0.50] DeFi portfolio aggregation regression suite.
 *
 * Phase 1 fix: balance_check was missing DeFi positions outside NAVI
 * savings, causing under-counts of net worth (e.g. funkii: $39.7k actual
 * vs $30.4k reported, gap = $8.5k Cetus/Suilend/etc.). The fetcher fans
 * out across the top 6 Sui DeFi protocols and rolls them into a single
 * `totalUsd`. NAVI is intentionally excluded — savings already cover it.
 */

const ADDRESS = '0xfeedface';
const SUI_TYPE_LONG =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const CETUS_TOKEN =
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS';

const realFetch = globalThis.fetch;

beforeEach(() => {
  clearDefiCache();
  clearPriceMapCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

type FetchInput = Parameters<typeof fetch>[0];

function mockJsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response;
}

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

describe('[v0.50] fetchAddressDefiPortfolio', () => {
  it('1) returns degraded summary with totalUsd=0 when apiKey is missing', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, undefined);
    expect(summary.totalUsd).toBe(0);
    expect(summary.source).toBe('degraded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2) does NOT fan out to NAVI (savings already covers it)', async () => {
    const seenProtocols: string[] = [];
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('/account/defiPortfolio')) {
        const proto = paramOf(url, 'protocol');
        if (proto) seenProtocols.push(proto);
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(seenProtocols).not.toContain('navi');
    expect(seenProtocols.sort()).toEqual(
      ['aftermath', 'bluefin', 'cetus', 'haedal', 'scallop', 'suilend'].sort(),
    );
  });

  it('3) sums Cetus LP raw amounts × prices correctly using priceHints + stables', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  // 1 SUI (raw 1e9, decimals=9) + 5 USDC (raw 5e6, decimals=6)
                  // SUI price hinted at $4 → contribution $4 + $5 = $9
                  coinTypeA: SUI_TYPE_LONG,
                  coinTypeADecimals: 9,
                  balanceA: '1000000000',
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
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k', { [SUI_TYPE_LONG]: 4 });
    expect(summary.source).toBe('blockvision');
    expect(summary.totalUsd).toBeCloseTo(9, 5);
    expect(summary.perProtocol.cetus).toBeCloseTo(9, 5);
  });

  it('4) Suilend deposits add and borrows subtract', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'suilend') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            suilend: {
              deposits: [
                { coinType: USDC_TYPE, decimals: 6, amount: '100000000' }, // $100
              ],
              borrows: [
                { coinType: USDC_TYPE, decimals: 6, amount: '40000000' }, // -$40
              ],
              strategies: [
                { coinType: USDC_TYPE, decimals: 6, amount: '20000000' }, // +$20
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.totalUsd).toBeCloseTo(80, 5);
    expect(summary.perProtocol.suilend).toBeCloseTo(80, 5);
  });

  it('5) Scallop reports pre-USD totals via totalSupplyValue/totalDebtValue', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'scallop') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            scallop: {
              totalSupplyValue: 5000,
              totalCollateralValue: 1500,
              totalLockedScaValue: 100,
              totalDebtValue: 2000,
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.totalUsd).toBeCloseTo(4600, 2);
    expect(summary.perProtocol.scallop).toBeCloseTo(4600, 2);
  });

  it('6) one protocol 5xx → marks source=partial but other protocols still aggregate', async () => {
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') {
        return new Response('boom', { status: 503 }) as unknown as Response;
      }
      if (proto === 'scallop') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: { scallop: { totalSupplyValue: 250 } },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(summary.source).toBe('partial');
    expect(summary.totalUsd).toBeCloseTo(250, 5);
  });

  it('7) caches per-address — second call within TTL does not re-fan-out', async () => {
    let cetusCalls = 0;
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') cetusCalls++;
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(cetusCalls).toBe(1);
  });

  it('8) auto-fetches missing prices for non-stable LP partner tokens', async () => {
    let priceCallCount = 0;
    let lastPriceTokens: string | null = null;
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = urlOf(input);
      if (url.includes('/coin/price/list')) {
        priceCallCount++;
        lastPriceTokens = paramOf(url, 'tokenIds');
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: { prices: { [CETUS_TOKEN]: '0.10' } },
        });
      }
      const proto = paramOf(url, 'protocol');
      if (proto === 'cetus') {
        return mockJsonResponse({
          code: 200,
          message: 'OK',
          result: {
            cetus: {
              lps: [
                {
                  coinTypeA: CETUS_TOKEN,
                  coinTypeADecimals: 9,
                  balanceA: '100000000000', // 100 CETUS @ $0.10 = $10
                  coinTypeB: USDC_TYPE,
                  coinTypeBDecimals: 6,
                  balanceB: '5000000', // $5
                },
              ],
            },
          },
        });
      }
      return mockJsonResponse({ code: 200, message: 'OK', result: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');
    expect(priceCallCount).toBe(1);
    expect(lastPriceTokens).toContain(CETUS_TOKEN);
    expect(summary.totalUsd).toBeCloseTo(15, 5);
  });
});
