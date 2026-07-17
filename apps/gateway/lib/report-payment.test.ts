import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Redis } from '@upstash/redis';

const logPaymentMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./log-payment', () => ({ logPayment: logPaymentMock }));
vi.mock('./env', () => ({ env: {} }));

import { findDirectServiceByUrl, verifyAndLogDirectPayment } from './report-payment';
import { SUI_USDC_TYPE } from './constants';
import { putEntry, setCatalogRedis } from './catalog-store';

// Direct sellers are dynamic entries now (SPEC_CATALOG_SELF_LISTING) — seed
// a JMPR-shaped one through an in-memory Redis fake.
const JMPR_PAY_TO = '0x' + 'ae'.repeat(32);
const VALID_DIGEST = 'D57rycxGS9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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
      name: 'JMPR Travel',
      serviceUrl: 'https://agent.jmpr.world',
      description: 'Luxury travel for agents.',
      chain: 'sui',
      currency: 'USDC',
      categories: ['commerce'],
      logo: '/logos/direct-seller.svg',
      direct: true,
      payTo: JMPR_PAY_TO,
      endpoints: [
        { method: 'POST', path: '/v1/hotels/search', description: 'Search luxury hotels', price: '0.02' },
      ],
    },
    agentAddress: JMPR_PAY_TO,
    probeUrl: 'https://agent.jmpr.world/v1/hotels/search',
    state: 'live',
    failCount: 0,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

function clientWith(changes: Array<{ coinType: string; address?: string; amount: string }>) {
  return {
    core: {
      getTransaction: vi.fn(async () => ({
        $kind: 'Transaction',
        Transaction: { balanceChanges: changes },
      })),
    },
  } as unknown as SuiGrpcClient;
}

describe('findDirectServiceByUrl', () => {
  it('matches a direct seller by origin and extracts the endpoint path', async () => {
    const match = await findDirectServiceByUrl('https://agent.jmpr.world/v1/hotels/search');
    expect(match?.service.id).toBe('jmpr');
    expect(match?.endpoint).toBe('/v1/hotels/search');
  });

  it('rejects non-direct origins (the gateway itself) and garbage', async () => {
    expect(await findDirectServiceByUrl('https://mpp.t2000.ai/openai/v1/chat/completions')).toBeNull();
    expect(await findDirectServiceByUrl('not a url')).toBeNull();
  });
});

describe('verifyAndLogDirectPayment', () => {
  it('records a verified USDC payment to the pinned payTo — amount + sender from chain', async () => {
    const client = clientWith([
      { coinType: SUI_USDC_TYPE, address: '0xbuyer', amount: '-20000' },
      { coinType: SUI_USDC_TYPE, address: JMPR_PAY_TO, amount: '20000' },
    ]);

    const outcome = await verifyAndLogDirectPayment({
      digest: VALID_DIGEST,
      url: 'https://agent.jmpr.world/v1/hotels/search',
      client,
    });

    expect(outcome).toEqual({ ok: true });
    expect(logPaymentMock).toHaveBeenCalledWith({
      service: 'jmpr',
      endpoint: '/v1/hotels/search',
      amount: '0.02',
      digest: VALID_DIGEST,
      sender: '0xbuyer',
    });
  });

  it('rejects a digest whose USDC inflow goes to someone else', async () => {
    const client = clientWith([
      { coinType: SUI_USDC_TYPE, address: '0xbuyer', amount: '-20000' },
      { coinType: SUI_USDC_TYPE, address: '0xnot-the-seller', amount: '20000' },
    ]);

    const outcome = await verifyAndLogDirectPayment({
      digest: VALID_DIGEST,
      url: 'https://agent.jmpr.world/v1/hotels/search',
      client,
    });

    expect(outcome).toMatchObject({ ok: false, status: 422 });
  });

  it('rejects non-USDC inflows to the right address', async () => {
    const client = clientWith([
      { coinType: '0x2::sui::SUI', address: JMPR_PAY_TO, amount: '20000' },
    ]);

    const outcome = await verifyAndLogDirectPayment({
      digest: VALID_DIGEST,
      url: 'https://agent.jmpr.world/v1/hotels/search',
      client,
    });

    expect(outcome).toMatchObject({ ok: false, status: 422 });
  });

  it('rejects a URL that is not a cataloged direct seller', async () => {
    const outcome = await verifyAndLogDirectPayment({
      digest: VALID_DIGEST,
      url: 'https://evil.example/v1/x',
      client: clientWith([]),
    });
    expect(outcome).toMatchObject({ ok: false, status: 404 });
  });

  it('rejects malformed digests before any chain read', async () => {
    const client = clientWith([]);
    const outcome = await verifyAndLogDirectPayment({
      digest: 'DROP TABLE; --',
      url: 'https://agent.jmpr.world/v1/hotels/search',
      client,
    });
    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(client.core.getTransaction).not.toHaveBeenCalled();
  });

  it('rejects a digest the chain cannot resolve', async () => {
    const client = {
      core: { getTransaction: vi.fn(async () => ({ $kind: 'FailedTransaction' })) },
    } as unknown as SuiGrpcClient;

    const outcome = await verifyAndLogDirectPayment({
      digest: VALID_DIGEST,
      url: 'https://agent.jmpr.world/v1/hotels/search',
      client,
    });
    expect(outcome).toMatchObject({ ok: false, status: 422 });
  });
});
