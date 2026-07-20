// [SPEC_T2_AGENTS_STORE] Gate tests — every gate has a pass AND a fail case
// (fail closed), for both the URL path (canonical) and the legacy address
// path. Chain reads, probes, and OpenAPI fetches are injected; Redis is an
// in-memory fake through setCatalogRedis().
import type { Redis } from '@upstash/redis';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ingestSeller,
  ingestSellerByUrl,
  previewSeller,
  reprobeAll,
  slugForSeller,
} from './catalog-ingest';
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

describe('gate 1 — url', () => {
  it('rejects a non-https URL without probing', async () => {
    const res = await ingestSellerByUrl('http://insecure.example/v1/x', {
      probe: async () => {
        throw new Error('should not be called');
      },
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates[0]).toMatchObject({ gate: 'url', ok: false });
  });

  it('rejects garbage input', async () => {
    const res = await ingestSellerByUrl('not a url', { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(false);
    expect(res.gates[0]).toMatchObject({ gate: 'url', ok: false });
  });

  it('rejects the gateway itself — proxied services are already cataloged', async () => {
    const res = await ingestSellerByUrl('https://mpp.t2000.ai/deepseek/v1/chat/completions', {
      probe: async () => {
        throw new Error('should not be called');
      },
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates[0]).toMatchObject({ gate: 'url', ok: false });
    expect(res.gates[0].detail).toContain('gateway itself');
  });

  it('rejects a gateway-alias hostname by payTo identity, not hostname', async () => {
    // A proxy/alias of the gateway on any hostname still pays a
    // gateway-owned wallet — the identity check catches it post-probe.
    const res = await ingestSellerByUrl('https://gateway-alias.example/deepseek/v1/chat', {
      probe: passingProbe({
        payTo: '0xb012ac774bee4ee6e4e571a13457eeb7a75c4f2319551bf9d436fd497d57aca1',
      }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    const probeGate = res.gates.find((g) => g.gate === 'probe');
    expect(probeGate?.ok).toBe(false);
    expect(probeGate?.detail).toContain('gateway itself');
  });

  it('passes a *.vercel.app seller — the serve-vercel template deploys there', async () => {
    const res = await ingestSellerByUrl('https://my-agent-api.vercel.app/search', {
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
    expect(res.payTo).toBe(SELLER);
  });

  it('passes a valid https URL — no account, no Agent ID, no signature', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(true);
    expect(res.gates[0]).toMatchObject({ gate: 'url', ok: true });
    expect(res.payTo).toBe(SELLER);
  });
});

describe('gate 2 — probe', () => {
  it('fails when the endpoint does not answer a payable 402', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, {
      probe: async () => ({ ok: false, issues: ['expected 402 payment challenge, got 200'] }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'probe', ok: false });
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('passes on a valid x402 challenge and stamps the dialect', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.gates.find((g) => g.gate === 'probe')).toMatchObject({ ok: true });
    expect((await getEntry(SELLER))?.service.dialect).toBe('x402');
  });
});

describe('gate 3 — dialect (x402 required)', () => {
  it('rejects a header-only seller — some buyers (zkLogin) cannot pay it', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, {
      probe: passingProbe({ dialect: 'mpp-header' }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'dialect', ok: false });
    expect(res.gates.at(-1)?.detail).toContain('x402 accepts[]');
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('suspends a LIVE entry immediately when the seller drops to header-only', async () => {
    // Listed while x402…
    await ingestSellerByUrl(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect((await getEntry(SELLER))?.state).toBe('live');

    // …then a resubmission finds header-only: down NOW, not after the
    // daily-reprobe failure window.
    const res = await ingestSellerByUrl(ENDPOINT, {
      probe: passingProbe({ dialect: 'mpp-header' }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    const entry = await getEntry(SELLER);
    expect(entry?.state).toBe('suspended');
    expect(entry?.lastProbeIssues?.[0]).toContain('x402');
  });
});

describe('gate 4 — price cap', () => {
  it('fails when any listed price exceeds the cap', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, {
      probe: passingProbe({ priceUsdc: '25' }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'price-cap', ok: false });
  });

  it('passes at or below the cap', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, {
      probe: passingProbe({ priceUsdc: '5' }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
  });
});

describe('entry construction (URL path)', () => {
  it('single-endpoint fast path lists the probed endpoint, keyed by payTo', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(true);
    const entry = await getEntry(SELLER);
    expect(entry?.agentAddress).toBe(SELLER);
    expect(entry?.service.direct).toBe(true);
    expect(entry?.service.payTo).toBe(SELLER);
    expect(entry?.service.endpoints).toEqual([
      { method: 'POST', path: '/v1/quote', description: '', price: '0.02' },
    ]);
  });

  it('multi-endpoint path enumerates from OpenAPI x-payment-info', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, {
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
                // The JMPR shape: body schema behind anyOf + $ref.
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        anyOf: [{ $ref: '#/components/schemas/QuoteRequest' }, { type: 'null' }],
                      },
                    },
                  },
                },
                responses: {
                  '402': {},
                  // Declared deliverable contract (@t2000/serve .response()).
                  '200': {
                    content: {
                      'application/json': {
                        schema: { $ref: '#/components/schemas/QuoteResult' },
                      },
                    },
                  },
                },
              },
            },
            '/v1/book': {
              post: {
                summary: 'Book it',
                // The nested live shape (JMPR): price is an object.
                'x-payment-info': {
                  price: { mode: 'fixed', currency: 'USD', amount: '0.500000' },
                },
                responses: { '402': {} },
              },
            },
          },
          components: {
            schemas: {
              QuoteRequest: {
                type: 'object',
                properties: { city: { type: 'string', description: 'City. Required.' } },
              },
              QuoteResult: {
                type: 'object',
                properties: {
                  reportMd: { type: 'string', contentMediaType: 'text/markdown' },
                },
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
    // Request-body schema extracted + $ref dereferenced (paid-422 defense).
    const quote = entry?.service.endpoints[0];
    expect(quote?.schema).toMatchObject({
      anyOf: [
        { type: 'object', properties: { city: { type: 'string', description: 'City. Required.' } } },
        { type: 'null' },
      ],
    });
    // Response schema extracted + dereferenced — the deliverable's type
    // contract rides the catalog so buyer UIs render by declared type.
    expect(quote?.responseSchema).toMatchObject({
      type: 'object',
      properties: {
        reportMd: { type: 'string', contentMediaType: 'text/markdown' },
      },
    });
    expect(entry?.service.endpoints[1].responseSchema).toBeUndefined();
  });

  it('resubmission keeps the slug and submittedAt, refreshes the rest', async () => {
    const deps = { probe: passingProbe(), fetchSpec: noSpec };
    const first = await ingestSellerByUrl(ENDPOINT, deps);
    const before = await getEntry(SELLER);
    const second = await ingestSellerByUrl(ENDPOINT, deps);
    expect(second.serviceId).toBe(first.serviceId);
    const after = await getEntry(SELLER);
    expect(after?.submittedAt).toBe(before?.submittedAt);
  });

  it('delisted is terminal — resubmission is rejected', async () => {
    await ingestSellerByUrl(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    const entry = (await getEntry(SELLER)) as DynamicCatalogEntry;
    await putEntry({ ...entry, state: 'delisted' });
    const res = await ingestSellerByUrl(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(false);
    expect(res.gates[0].detail).toContain('delisted');
  });
});

describe('previewSeller (dry run + listing grade)', () => {
  it('writes nothing', async () => {
    const res = await previewSeller(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(true);
    expect(res.service?.payTo).toBe(SELLER);
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('grades a spec-less listing with the no-openapi copy-prompt', async () => {
    const res = await previewSeller(ENDPOINT, { probe: passingProbe(), fetchSpec: noSpec });
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0].code).toBe('no-openapi');
    expect(res.warnings[0].prompt).toContain('x-payment-info');
  });

  it('grades missing schemas + unpriced endpoints on a served spec', async () => {
    const res = await previewSeller(ENDPOINT, {
      probe: passingProbe(),
      fetchSpec: async () =>
        ({
          openapi: '3.1.0',
          info: { title: 'Example Seller', version: '1.0' },
          paths: {
            '/v1/quote': {
              post: {
                summary: 'Get a quote',
                'x-payment-info': { price: '0.02', currency: 'USDC' },
                responses: { '402': {} },
              },
            },
            '/v1/dynamic': {
              post: {
                summary: 'Dynamic pricing',
                'x-payment-info': { price: { mode: 'dynamic' } },
                responses: { '402': {} },
              },
            },
          },
        }) as never,
    });
    expect(res.ok).toBe(true);
    const codes = res.warnings.map((w) => w.code).sort();
    expect(codes).toEqual(['missing-schemas', 'no-description', 'unpriced-endpoints']);
    for (const w of res.warnings) expect(w.prompt.length).toBeGreaterThan(40);
  });

  it('a clean spec earns zero warnings', async () => {
    const res = await previewSeller(ENDPOINT, {
      probe: passingProbe(),
      fetchSpec: async () =>
        ({
          openapi: '3.1.0',
          info: { title: 'Example Seller', version: '1.0', description: 'Quotes.' },
          paths: {
            '/v1/quote': {
              post: {
                summary: 'Get a quote',
                'x-payment-info': { price: '0.02', currency: 'USDC' },
                requestBody: {
                  content: {
                    'application/json': {
                      schema: { type: 'object', properties: { city: { type: 'string' } } },
                    },
                  },
                },
                responses: { '402': {} },
              },
            },
          },
        }) as never,
    });
    expect(res.warnings).toEqual([]);
  });
});

describe('escrow-intent (job-class) listings — SPEC_A2A_ESCROW slice 2', () => {
  const TERMS = { deliverWithinMs: 86_400_000, reviewWindowMs: 3_600_000, rejectSplitBps: 8000 };
  const JOB_URL = 'https://api.example-seller.dev/jobs/research-report';
  const claimed = async () => ({ agent: SELLER, mcp_endpoint: null });
  const unclaimed = async () => null;

  it('claim gate: an UNCLAIMED payTo wallet cannot list a job', async () => {
    const res = await ingestSellerByUrl(JOB_URL, {
      probe: passingProbe({ escrow: TERMS, priceUsdc: '5' }),
      getRecord: unclaimed,
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates.at(-1)).toMatchObject({ gate: 'claim', ok: false });
    expect(res.gates.at(-1)?.detail).toContain('agent register');
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('a claimed wallet lists a single-endpoint job entry with terms', async () => {
    const res = await ingestSellerByUrl(JOB_URL, {
      probe: passingProbe({ escrow: TERMS, priceUsdc: '5' }),
      getRecord: claimed,
      fetchSpec: async () => {
        throw new Error('should not be called — job listings skip OpenAPI enumeration');
      },
    });
    expect(res.ok).toBe(true);
    expect(res.gates.find((g) => g.gate === 'claim')).toMatchObject({ ok: true });
    const entry = await getEntry(SELLER);
    expect(entry?.service.escrow).toEqual(TERMS);
    expect(entry?.service.categories).toEqual(['jobs']);
    expect(entry?.service.endpoints).toEqual([
      { method: 'POST', path: '/jobs/research-report', description: '', price: '5' },
    ]);
  });

  it('job cap is $50, not the $5 call cap — $30 passes, $60 fails', async () => {
    const pass = await previewSeller(JOB_URL, {
      probe: passingProbe({ escrow: TERMS, priceUsdc: '30' }),
      getRecord: claimed,
      fetchSpec: noSpec,
    });
    expect(pass.ok).toBe(true);

    const fail = await previewSeller(JOB_URL, {
      probe: passingProbe({ escrow: TERMS, priceUsdc: '60' }),
      getRecord: claimed,
      fetchSpec: noSpec,
    });
    expect(fail.ok).toBe(false);
    expect(fail.gates.at(-1)).toMatchObject({ gate: 'price-cap', ok: false });
    expect(fail.gates.at(-1)?.detail).toContain('job-value cap');
  });

  it('instant listings never hit the claim gate (no regression)', async () => {
    const res = await ingestSellerByUrl(ENDPOINT, {
      probe: passingProbe(),
      getRecord: unclaimed,
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
    expect(res.gates.find((g) => g.gate === 'claim')).toBeUndefined();
  });
});

describe('legacy address path (released CLI/MCP clients)', () => {
  it('resolves the on-chain endpoint then runs the URL ingest', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
    expect((await getEntry(SELLER))?.service.payTo).toBe(SELLER);
  });

  it('unregistered address points at the URL path instead', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: async () => null,
      probe: passingProbe(),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(false);
    expect(res.gates[0].detail).toContain('POST your API URL');
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

  it('clearing the on-chain endpoint removes the entry', async () => {
    await ingestSeller(SELLER, { getRecord: record(ENDPOINT), probe: passingProbe(), fetchSpec: noSpec });
    const res = await ingestSeller(SELLER, { getRecord: record(null), probe: passingProbe(), fetchSpec: noSpec });
    expect(res.ok).toBe(true);
    expect(res.removed).toBe(true);
    expect(await getEntry(SELLER)).toBeNull();
  });

  it('no payTo cross-check anymore — a challenge paying a different wallet lists under THAT wallet', async () => {
    const res = await ingestSeller(SELLER, {
      getRecord: record(ENDPOINT),
      probe: passingProbe({ payTo: OTHER }),
      fetchSpec: noSpec,
    });
    expect(res.ok).toBe(true);
    expect(res.payTo).toBe(OTHER);
    expect((await getEntry(OTHER))?.service.payTo).toBe(OTHER);
    expect(await getEntry(SELLER)).toBeNull();
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

  it('uses the subdomain on multi-tenant hosting — vercel.app names the platform, not the seller', () => {
    expect(slugForSeller('https://funkii-ai.vercel.app', SELLER)).toBe('funkii-ai');
    expect(slugForSeller('https://my-shop.pages.dev', SELLER)).toBe('my-shop');
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

  it('a payTo CHANGE suspends immediately — identity must not silently transfer', async () => {
    await seed('live', 0);
    await reprobeAll(passingProbe({ payTo: OTHER }));
    const entry = await getEntry(SELLER);
    expect(entry?.state).toBe('suspended');
    expect(entry?.lastProbeIssues?.[0]).toContain('payout wallet changed');
  });

  it('treats a drop to header-only as a failure (same bar as ingest)', async () => {
    await seed('live', 2);
    await reprobeAll(passingProbe({ dialect: 'mpp-header' }));
    const entry = await getEntry(SELLER);
    expect(entry?.state).toBe('suspended');
    expect(entry?.lastProbeIssues?.[0]).toContain('x402');
  });

  it('class drift fails: a job-class entry whose 402 drops escrow terms', async () => {
    await seed('live', 2);
    const entry = (await getEntry(SELLER)) as DynamicCatalogEntry;
    await putEntry({
      ...entry,
      service: {
        ...entry.service,
        escrow: { deliverWithinMs: 1000, reviewWindowMs: 0, rejectSplitBps: 8000 },
      },
    });
    await reprobeAll(passingProbe()); // instant probe, no escrow
    const after = await getEntry(SELLER);
    expect(after?.state).toBe('suspended');
    expect(after?.lastProbeIssues?.[0]).toContain('no longer advertises escrow');
  });

  it('an instant entry whose 402 turns job-class fails too (resubmit to relist)', async () => {
    await seed('live', 2);
    await reprobeAll(
      passingProbe({
        escrow: { deliverWithinMs: 1000, reviewWindowMs: 0, rejectSplitBps: 8000 },
      }),
    );
    const entry = await getEntry(SELLER);
    expect(entry?.state).toBe('suspended');
    expect(entry?.lastProbeIssues?.[0]).toContain('now advertises escrow');
  });

  it('a passing reprobe refreshes escrow terms on a job-class entry', async () => {
    await seed('live', 0);
    const entry = (await getEntry(SELLER)) as DynamicCatalogEntry;
    await putEntry({
      ...entry,
      service: {
        ...entry.service,
        escrow: { deliverWithinMs: 1000, reviewWindowMs: 0, rejectSplitBps: 8000 },
      },
    });
    const fresh = { deliverWithinMs: 2000, reviewWindowMs: 500, rejectSplitBps: 5000 };
    await reprobeAll(passingProbe({ escrow: fresh }));
    expect((await getEntry(SELLER))?.service.escrow).toEqual(fresh);
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
