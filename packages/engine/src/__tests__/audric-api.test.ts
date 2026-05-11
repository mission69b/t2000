import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAudricHistory,
  fetchAudricPortfolio,
  getAudricApiBase,
} from '../audric-api.js';

const ADDRESS = '0xabc1234567890abcdef';

describe('audric-api', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.T2000_AUDRIC_API;
    delete process.env.AUDRIC_INTERNAL_API_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getAudricApiBase', () => {
    it('returns null when no env var is set', () => {
      expect(getAudricApiBase()).toBeNull();
      expect(getAudricApiBase({})).toBeNull();
    });

    it('prefers context env over process.env', () => {
      process.env.AUDRIC_INTERNAL_API_URL = 'https://from-process.example';
      expect(getAudricApiBase({ T2000_AUDRIC_API: 'https://from-context.example' }))
        .toBe('https://from-context.example');
    });

    it('falls back to legacy AUDRIC_INTERNAL_API_URL env var', () => {
      process.env.AUDRIC_INTERNAL_API_URL = 'https://legacy.example';
      expect(getAudricApiBase()).toBe('https://legacy.example');
    });

    it('strips trailing slashes', () => {
      expect(getAudricApiBase({ T2000_AUDRIC_API: 'https://api.example/' }))
        .toBe('https://api.example');
    });

    it('treats blank strings as unset', () => {
      expect(getAudricApiBase({ T2000_AUDRIC_API: '   ' })).toBeNull();
    });
  });

  describe('fetchAudricPortfolio', () => {
    it('returns null when audric base is unset (CLI / standalone mode)', async () => {
      const result = await fetchAudricPortfolio(ADDRESS);
      expect(result).toBeNull();
    });

    it('hits /api/portfolio with the provided address and shapes the response', async () => {
      global.fetch = vi.fn(async (url) => {
        expect(String(url)).toContain('/api/portfolio?address=' + encodeURIComponent(ADDRESS));
        return new Response(
          JSON.stringify({
            address: ADDRESS,
            netWorthUsd: 250,
            walletValueUsd: 200,
            walletAllocations: { USDC: 200 },
            wallet: [
              {
                coinType: '0x2::sui::SUI',
                symbol: 'SUI',
                decimals: 9,
                balance: '0',
                price: 1,
                usdValue: 0,
              },
            ],
            positions: {
              savings: 50,
              borrows: 0,
              savingsRate: 0.05,
              healthFactor: null,
              maxBorrow: 0,
              pendingRewards: 0,
              supplies: [],
              borrowsDetail: [],
            },
            estimatedDailyYield: 0.0068,
            source: 'blockvision',
            pricedAt: 1_000_000,
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      const result = await fetchAudricPortfolio(ADDRESS, {
        T2000_AUDRIC_API: 'https://api.example',
      });

      expect(result).not.toBeNull();
      expect(result!.portfolio.totalUsd).toBe(200);
      expect(result!.portfolio.source).toBe('blockvision');
      expect(result!.positions.savings).toBe(50);
      expect(result!.positions.savingsRate).toBe(0.05);
      // Engine field name is borrows_detail, audric wire shape is borrowsDetail.
      expect(result!.positions.borrows_detail).toEqual([]);
      expect(result!.netWorthUsd).toBe(250);
      expect(result!.walletAllocations).toEqual({ USDC: 200 });
    });

    it('returns null when the audric route 5xxs', async () => {
      global.fetch = vi.fn(async () => new Response('boom', { status: 503 })) as typeof fetch;
      const result = await fetchAudricPortfolio(ADDRESS, {
        T2000_AUDRIC_API: 'https://api.example',
      });
      expect(result).toBeNull();
    });

    it('returns null when the fetch throws', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('network down');
      }) as typeof fetch;
      const result = await fetchAudricPortfolio(ADDRESS, {
        T2000_AUDRIC_API: 'https://api.example',
      });
      expect(result).toBeNull();
    });

    // [SPEC 23B-W1.1, 2026-05-11] Pin the cache-bypass posture so the
    // PWR BalanceCard staleness regression cannot return silently. The
    // audric `/api/portfolio` route ships `Cache-Control: public,
    // s-maxage=15` for browser-side hooks; the engine MUST send
    // `Cache-Control: no-cache` to bypass the Vercel Edge cache so
    // post-write reads always see fresh data. (The `cache` fetch option
    // is intentionally NOT used — it's not on Node's undici RequestInit.)
    it('passes Cache-Control:no-cache header to bypass Vercel Edge cache', async () => {
      const fetchSpy: typeof fetch = vi.fn(async () => new Response(
        JSON.stringify({
          address: ADDRESS,
          netWorthUsd: 0,
          walletValueUsd: 0,
          walletAllocations: {},
          wallet: [],
          positions: { savings: 0, borrows: 0, savingsRate: 0, healthFactor: null, maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [] },
          estimatedDailyYield: 0,
          source: 'blockvision',
          pricedAt: 0,
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
      global.fetch = fetchSpy;

      await fetchAudricPortfolio(ADDRESS, { T2000_AUDRIC_API: 'https://api.example' });

      const mock = (fetchSpy as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } }).mock;
      expect(mock.calls).toHaveLength(1);
      const init = mock.calls[0][1] ?? {};
      const headers = init.headers as Record<string, string> | undefined;
      expect(headers?.['Cache-Control']).toBe('no-cache');
    });
  });

  describe('fetchAudricHistory', () => {
    it('returns null when audric base is unset', async () => {
      const result = await fetchAudricHistory(ADDRESS, { limit: 10 });
      expect(result).toBeNull();
    });

    it('renames `counterparty` to `recipient` to match engine field naming', async () => {
      global.fetch = vi.fn(async (url) => {
        const u = String(url);
        expect(u).toContain('/api/history');
        expect(u).toContain('limit=20');
        return new Response(
          JSON.stringify({
            items: [
              {
                digest: '0xdig',
                action: 'send',
                label: 'transfer',
                direction: 'out',
                amount: 5,
                asset: 'USDC',
                counterparty: '0xrecipient',
                timestamp: 1_700_000_000_000,
                gasCost: 0.001,
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      const result = await fetchAudricHistory(ADDRESS, { limit: 20 }, {
        T2000_AUDRIC_API: 'https://api.example',
      });

      expect(result).not.toBeNull();
      expect(result![0].recipient).toBe('0xrecipient');
      expect(result![0].digest).toBe('0xdig');
      expect(result![0].action).toBe('send');
      expect(result![0].direction).toBe('out');
    });

    // [SPEC 23B-W1.1, 2026-05-11] Symmetric posture with portfolio fetch.
    // `/api/history` is uncached today, but the test guards against
    // anyone adding caching to that route in the future.
    it('passes Cache-Control:no-cache header to bypass Vercel Edge cache', async () => {
      const fetchSpy: typeof fetch = vi.fn(async () => new Response(
        JSON.stringify({ items: [] }),
        { status: 200 },
      )) as unknown as typeof fetch;
      global.fetch = fetchSpy;

      await fetchAudricHistory(ADDRESS, { limit: 5 }, { T2000_AUDRIC_API: 'https://api.example' });

      const mock = (fetchSpy as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } }).mock;
      expect(mock.calls).toHaveLength(1);
      const init = mock.calls[0][1] ?? {};
      const headers = init.headers as Record<string, string> | undefined;
      expect(headers?.['Cache-Control']).toBe('no-cache');
    });

    it('returns null on HTTP error and null on network failure', async () => {
      global.fetch = vi.fn(async () => new Response('', { status: 500 })) as typeof fetch;
      expect(
        await fetchAudricHistory(ADDRESS, {}, { T2000_AUDRIC_API: 'https://api.example' }),
      ).toBeNull();

      global.fetch = vi.fn(async () => {
        throw new Error('boom');
      }) as typeof fetch;
      expect(
        await fetchAudricHistory(ADDRESS, {}, { T2000_AUDRIC_API: 'https://api.example' }),
      ).toBeNull();
    });
  });
});
