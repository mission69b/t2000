import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from '@upstash/redis';

const verifyMock = vi.hoisted(() => vi.fn(async () => ({ ok: true }) as const));
vi.mock('./report-payment', () => ({ verifyAndLogDirectPayment: verifyMock }));
vi.mock('./env', () => ({ env: {} }));

import { putEntry, setCatalogRedis } from './catalog-store';
import {
  digestFromMppCredential,
  digestFromX402Response,
  pathMatchesListed,
  relayToSeller,
  resolveRelayTarget,
} from './relay';

const SELLER = '0x' + 'ae'.repeat(32);
const DIGEST = 'D57rycxGS9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeAll(async () => {
  const kv = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  setCatalogRedis({
    get: async (k: string) => kv.get(k) ?? null,
    set: async (k: string, v: unknown) => void kv.set(k, v),
    del: async (k: string) => void kv.delete(k),
    sadd: async (k: string, ...m: string[]) => void sets.set(k, new Set([...(sets.get(k) ?? []), ...m])),
    srem: async () => 0,
    smembers: async (k: string) => [...(sets.get(k) ?? [])],
    mget: async (...keys: string[]) => keys.map((k) => kv.get(k) ?? null),
  } as unknown as Redis);
  await putEntry({
    service: {
      id: 'jmpr',
      name: 'JMPR — Luxury Hotels API',
      serviceUrl: 'https://agent.jmpr.world',
      description: 'Luxury travel for agents.',
      chain: 'sui',
      currency: 'USDC',
      categories: ['commerce'],
      logo: '/logos/direct-seller.svg',
      direct: true,
      payTo: SELLER,
      endpoints: [
        { method: 'POST', path: '/v1/hotels/search', description: '', price: '0.02' },
        { method: 'GET', path: '/v1/bookings/{booking_id}', description: '', price: '0.01' },
      ],
    },
    agentAddress: SELLER,
    probeUrl: 'https://agent.jmpr.world/v1/hotels/search',
    state: 'live',
    failCount: 0,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

beforeEach(() => {
  verifyMock.mockClear();
});

describe('pathMatchesListed', () => {
  it('matches exact and templated paths, rejects everything else', () => {
    expect(pathMatchesListed('/v1/hotels/search', '/v1/hotels/search')).toBe(true);
    expect(pathMatchesListed('/v1/bookings/abc123', '/v1/bookings/{booking_id}')).toBe(true);
    expect(pathMatchesListed('/v1/bookings/abc/cancel', '/v1/bookings/{booking_id}')).toBe(false);
    expect(pathMatchesListed('/v1/admin', '/v1/hotels/search')).toBe(false);
  });
});

describe('resolveRelayTarget — catalog pinning', () => {
  it('resolves a listed direct-seller endpoint to the seller origin', async () => {
    const target = await resolveRelayTarget('jmpr', '/v1/hotels/search');
    expect(target?.url).toBe('https://agent.jmpr.world/v1/hotels/search');
  });

  it('refuses unlisted paths — the relay is not an open proxy', async () => {
    expect(await resolveRelayTarget('jmpr', '/v1/admin/secrets')).toBeNull();
  });

  it('refuses non-direct services (proxied ones already have CORS)', async () => {
    expect(await resolveRelayTarget('openai', '/v1/chat/completions')).toBeNull();
  });

  it('refuses unknown services', async () => {
    expect(await resolveRelayTarget('nope', '/v1/hotels/search')).toBeNull();
  });
});

describe('digest extraction — both dialects', () => {
  it('reads the digest from an MPP header credential', () => {
    const credential = Buffer.from(
      JSON.stringify({ challenge: {}, payload: { digest: DIGEST, signature: 'sig' } }),
    ).toString('base64');
    expect(digestFromMppCredential(`Payment ${credential}`)).toBe(DIGEST);
  });

  it('reads the digest from an x402 settle response header', () => {
    const header = Buffer.from(JSON.stringify({ transaction: DIGEST })).toString('base64');
    expect(digestFromX402Response(header)).toBe(DIGEST);
  });

  it('returns undefined on garbage instead of throwing', () => {
    expect(digestFromMppCredential('Bearer nope')).toBeUndefined();
    expect(digestFromMppCredential('Payment %%%')).toBeUndefined();
    expect(digestFromX402Response('%%%')).toBeUndefined();
    expect(digestFromMppCredential(null)).toBeUndefined();
    expect(digestFromX402Response(null)).toBeUndefined();
  });
});

describe('relayToSeller', () => {
  it('mirrors the seller 402 challenge with CORS attached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'payment required' }), {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'www-authenticate': 'Payment method="sui", amount="0.02"',
          },
        }),
      ),
    );
    try {
      const req = new Request('https://mpp.t2000.ai/api/relay/jmpr/v1/hotels/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const { response, logSettlement } = await relayToSeller(req, 'jmpr', '/v1/hotels/search');
      expect(response.status).toBe(402);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('www-authenticate')).toContain('method="sui"');
      // A 402 settles nothing — no ledger write.
      expect(logSettlement).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('404s for unlisted paths without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const req = new Request('https://mpp.t2000.ai/api/relay/jmpr/v1/admin', {
        method: 'POST',
      });
      const { response } = await relayToSeller(req, 'jmpr', '/v1/admin');
      expect(response.status).toBe(404);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('logs the settlement from the MPP credential on a delivered response', async () => {
    const credential = Buffer.from(
      JSON.stringify({ challenge: {}, payload: { digest: DIGEST, signature: 'sig' } }),
    ).toString('base64');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    try {
      const req = new Request('https://mpp.t2000.ai/api/relay/jmpr/v1/hotels/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Payment ${credential}`,
        },
        body: '{}',
      });
      const { response, logSettlement } = await relayToSeller(req, 'jmpr', '/v1/hotels/search');
      expect(response.status).toBe(200);
      expect(logSettlement).toBeDefined();
      await logSettlement?.();
      expect(verifyMock).toHaveBeenCalledWith({
        digest: DIGEST,
        url: 'https://agent.jmpr.world/v1/hotels/search',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('502s (not throws) when the seller is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))));
    try {
      const req = new Request('https://mpp.t2000.ai/api/relay/jmpr/v1/hotels/search', {
        method: 'POST',
        body: '{}',
      });
      const { response } = await relayToSeller(req, 'jmpr', '/v1/hotels/search');
      expect(response.status).toBe(502);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
