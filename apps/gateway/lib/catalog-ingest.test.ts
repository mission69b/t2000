// [SPEC_CATALOG_SELF_LISTING] Gate tests — every gate has a pass AND a fail
// case (fail closed). Chain reads, probes, and OpenAPI fetches are injected;
// Redis is an in-memory fake through setCatalogRedis().
import type { Redis } from '@upstash/redis';
import { beforeEach, describe, expect, it } from 'vitest';
import { ingestSeller, reprobeAll, slugForSeller } from './catalog-ingest';
import {
  getEntry,
  listEntries,
  putEntry,
  setCatalogRedis,
  type DynamicCatalogEntry,
} from './catalog-store';
import type { SellerProbeResult } from './seller-probe';
import type { Service } from './services';

// ─── In-memory Redis fake (get/set/del/sadd/srem/smembers/mget) ───────
function fakeRedis(): Redis {
  const kv = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  return {
    get: async (k: string) => kv.get(k) ?? null,
    set: async (k: string, v: unknown) => {
      kv.set(k, v);
      return 'OK';
    },
    del: async (k: string) => (kv.delete(k) ? 1 : 0),
    sadd: async (k: string, ...members: string[]) => {
      const s = sets.get(k) ?? new Set<string>();
      for (const m of members) s.add(m);
      sets.set(k, s);
      return members.length;
    },
    srem: async (k: string, ...members: string[]) => {
      const s = sets.get(k);
      let n = 0;
      for (const m of members) if (s?.delete(m)) n += 1;
      return n;
    },
    smembers: async (k: string) => [...(sets.get(k) ?? [])],
    mget: async (...keys: string[]) => keys.map((k) => kv.get(k) ?? null),
  } as unknown as Redis;
}

const SELLER = '0x' + 'a1'.repeat(32);
const OTHER = '0x' + 'b2'.repeat(32);
const ENDPOINT = 'https://api.example-seller.dev/v1/quote';

const record = (mcp: string | null) => async () => ({
  agent: SELLER,
  mcp_endpoint: mcp,
});

const passingProbe = (over: Partial<SellerProbeResult> = {}) =>
  async (): Promise<SellerProbeResult> => ({
    ok: true,
    payTo: SELLER,
    priceUsdc: '0.02',
    dialect: 'x402',
    issues: [],
    ...over,
  });

const noSpec = async () => {
  throw new Error('no openapi');
};

beforeEach(() => {
  setCatalogRedis(fakeRedis());
});

describe('gate 1 — agent-id', () => {
  it('fails for an unregistered address', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: async () => null,
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates[0]).toMatchObject({ gate: 'agent-id', ok: false });
  });

  it('fails when the record has no on-chain endpoint', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(null),
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates[0].detail).toContain('t2 agent sell');
  });

  it('rejects a malformed address without touching the chain', async () => {
    const res = await ingestSeller('not-an-address', {
      getRecord: async () => {
        throw new Error('should not be called');
      },
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
  });

  it('passes with a registered https endpoint', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.gates[0]).toMatchObject({ gate: 'agent-id', ok: true });
    expect(res.ok).toBe(true);
  });
});

describe('gate 2 — probe', () => {
  it('fails when the endpoint does not answer a payable 402', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: async () => ({ ok: false, issues: ['expected 402 payment challenge, got 200'] }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'probe', ok: false });
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('passes on a valid dual-dialect challenge', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe({ dialect: 'mpp-header' }),
      fetchSpec: noSpec,
    });
    expect(res.gates.find((g) => g.gate === 'probe')).toMatchObject({ ok: true });
  });
});

describe('gate 3 — payto binding', () => {
  it('fails when the challenge pays a different wallet', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe({ payTo: OTHER }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'payto', ok: false });
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('passes when the challenge pays the registered wallet', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.gates.find((g) => g.gate === 'payto')).toMatchObject({ ok: true });
  });
});

describe('gate 4 — price cap', () => {
  it('fails when any listed price exceeds the cap', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe({ priceUsdc: '25' }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'price-cap', ok: false });
  });

  it('passes at or below the cap', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe({ priceUsdc: '5' }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
  });
});

describe('entry construction', () => {
  it('single-endpoint fast path lists the probed endpoint', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
    const entry = await getEntry(SELLER);
    expect(entry?.service.direct).toBe(true);
    expect(entry?.service.payTo).toBe(SELLER);
    expect(entry?.service.endpoints).toEqual([
      { method: 'POST', path: '/v1/quote', description: '', price: '0.02' },
    ]);
  });

  it('multi-endpoint path enumerates from OpenAPI x-payment-info', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe(),
      fetchSpec: async () =>
        ({
          openapi: '3.1.0',
          info: { title: 'Example Seller', version: '1.0', description: 'Quotes and bookings.' },
          paths: {
            '/v1/quote': {
              post: {
                summary: 'Get a quote',
                'x-payment-info': { price: '0.02', currency: 'USDC' },
                responses: { '402': {} },
              },
            },
            '/v1/book': {
              post: {
                summary: 'Book it',
                'x-payment-info': { price: '0.50', currency: 'USDC' },
                responses: { '402': {} },
              },
            },
          },
        }) as never,
    });
    expect(res.ok).toBe(true);
    const entry = await getEntry(SELLER);
    expect(entry?.service.name).toBe('Example Seller');
    expect(entry?.service.endpoints).toHaveLength(2);
    expect(entry?.service.endpoints[1]).toMatchObject({ path: '/v1/book', price: '0.5' });
  });

  it('resubmission keeps the slug and submittedAt, refreshes the rest', async () => {
    const deps = { getRecord: record(ENDPOINT), probe: passingProbe(), fetchSpec: noSpec };
    const first = await ingestSeller(SELLER, deps);
    const before = await getEntry(SELLER);
    const second = await ingestSeller(SELLER, deps);
    expect(second.serviceId).toBe(first.serviceId);
    const after = await getEntry(SELLER);
    expect(after?.submittedAt).toBe(before?.submittedAt);
  });

  it('clearing the on-chain endpoint removes the entry', async () => {
    await ingestSeller(SELLER, { getRecord: record(ENDPOINT), probe: passingProbe(), fetchSpec: noSpec });
    const res = await ingestSeller(SELLER, { getRecord: record(null), probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(true);
    expect(res.removed).toBe(true);
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('delisted is terminal — resubmission is rejected', async () => {
    await ingestSeller(SELLER, { getRecord: record(ENDPOINT), probe: passingProbe(), fetchSpec: noSpec });
    const entry = (await getEntry(SELLER)) as DynamicCatalogEntry;
    await putEntry({ ...entry, state: 'delisted' });
    const res = await ingestSeller(SELLER, { getRecord: record(ENDPOINT), probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(false);
    expect(res.gates[0].detail).toContain('delisted');
  });
});

describe('slugForSeller', () => {
  it('uses the registrable hostname label', () => {
    expect(slugForSeller('https://agent.jmpr.world', SELLER)).toBe('jmpr');
  });

  it('suffixes when a static catalog id owns the slug', () => {
    expect(slugForSeller('https://api.openai.dev', SELLER)).toBe(
      `openai-${SELLER.slice(2, 8)}`,
    );
  });
});

describe('reprobeAll', () => {
  const seed = async (state: DynamicCatalogEntry['state'] = 'live', failCount = 0) => {
    const service: Service = {
      id: 'example-seller',
      name: 'Example Seller',
      serviceUrl: 'https://api.example-seller.dev',
      description: 'x',
      chain: 'sui',
      currency: 'USDC',
      categories: ['commerce'],
      logo: '/logos/direct-seller.svg',
      endpoints: [{ method: 'POST', path: '/v1/quote', description: '', price: '0.02' }],
      direct: true,
      payTo: SELLER,
    };
    await putEntry({
      service,
      agentAddress: SELLER,
      probeUrl: ENDPOINT,
      state,
      failCount,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  it('suspends after 3 consecutive failures, not before', async () => {
    await seed('live', 2);
    const summary = await reprobeAll(async () => ({ ok: false, issues: ['down'] }));
    expect(summary.suspended).toEqual(['example-seller']);
    expect((await getEntry(SELLER))?.state).toBe('suspended');
  });

  it('keeps a failing-but-under-threshold entry live', async () => {
    await seed('live', 0);
    await reprobeAll(async () => ({ ok: false, issues: ['down'] }));
    const entry = await getEntry(SELLER);
    expect(entry?.state).toBe('live');
    expect(entry?.failCount).toBe(1);
  });

  it('recovers a suspended entry on a passing probe', async () => {
    await seed('suspended', 5);
    const summary = await reprobeAll(passingProbe());
    expect(summary.recovered).toEqual(['example-seller']);
    const entry = await getEntry(SELLER);
    expect(entry?.state).toBe('live');
    expect(entry?.failCount).toBe(0);
  });

  it('treats a payTo drift as a failure', async () => {
    await seed('live', 2);
    await reprobeAll(passingProbe({ payTo: OTHER }));
    expect((await getEntry(SELLER))?.state).toBe('suspended');
  });

  it('skips delisted entries', async () => {
    await seed('delisted');
    const summary = await reprobeAll(passingProbe());
    expect(summary.checked).toBe(0);
    expect((await getEntry(SELLER))?.state).toBe('delisted');
  });

  it('only live entries surface in listLiveServices via listEntries state filter', async () => {
    await seed('suspended');
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    const { listLiveServices } = await import('./catalog-store');
    expect(await listLiveServices()).toEqual([]);
  });
});
