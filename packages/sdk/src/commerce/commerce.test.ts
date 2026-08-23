import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { T2000Error } from '../errors.js';
import type { TransactionSigner } from '../signer.js';
import { setSponsoredTxGuard } from '../sponsored-guard.js';
import {
  profileChallengeMessage,
  serviceChallengeMessage,
  servicePayloadSha256,
} from './challenge.js';
import { CommerceClient } from './client.js';
import { endpointIssueLines } from './endpoint.js';
import { planPackage } from './package.js';
import { agentResolveUrl, resolveAgentRef } from './resolve.js';
import { serviceUpsertPayload } from './service.js';

const BASE = 'https://api.example.test/v1';
const ADDRESS = `0x${'a'.repeat(64)}`;
const TX_BYTES = Buffer.from('sponsored-tx').toString('base64');

function stubSigner() {
  const signed: { tx: string[]; messages: string[] } = { tx: [], messages: [] };
  const signer: TransactionSigner = {
    getAddress: () => ADDRESS,
    signTransaction: async (bytes) => {
      signed.tx.push(new TextDecoder().decode(bytes));
      return { signature: 'tx-sig' };
    },
    signPersonalMessage: async (bytes) => {
      signed.messages.push(new TextDecoder().decode(bytes));
      return { signature: 'msg-sig' };
    },
  };
  return { signer, signed };
}

function mockFetchQueue(
  responses: { json: unknown; ok?: boolean; status?: number }[],
) {
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const next = responses.shift() ?? { json: {}, ok: true };
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body) : null,
      });
      return {
        ok: next.ok ?? true,
        status: next.status ?? 200,
        json: async () => next.json,
      };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setSponsoredTxGuard(null);
});

describe('payload hashing — mirrors the API (sha256 of JSON.stringify(payload))', () => {
  it('WebCrypto hash equals node:crypto over the same bytes', async () => {
    const payload = serviceUpsertPayload({
      slug: ' Logo-Sketch ',
      name: ' Logo sketch ',
      description: 'Three concepts',
      priceUsdc: 5,
      slaMinutes: 1440,
      deliverable: 'PNG',
      requirements: 'Brand name and vibe',
    });
    const expected = createHash('sha256')
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
    await expect(servicePayloadSha256(payload)).resolves.toBe(expected);
    // Key order IS the signed bytes — fixed in one place.
    expect(Object.keys(payload)).toEqual([
      'slug', 'name', 'description', 'priceUsdc', 'slaMinutes',
      'reviewWindowMinutes', 'rejectSplitBps', 'requirements', 'deliverable',
    ]);
    expect(payload.slug).toBe('logo-sketch');
    expect(payload.reviewWindowMinutes).toBe(1440);
    expect(payload.rejectSplitBps).toBe(8000);
  });

  it('challenge message grammars', () => {
    expect(profileChallengeMessage('n1')).toBe('t2000-agent-profile:n1');
    expect(serviceChallengeMessage('n1', 'abc')).toBe('t2000-agent-service:n1:abc');
  });

  it('refuses an off-grammar slug before any network call', () => {
    expect(() =>
      serviceUpsertPayload({
        slug: '-bad', name: 'x', description: 'x', priceUsdc: 1,
        slaMinutes: 60, deliverable: 'x', requirements: 'x',
      }),
    ).toThrow(T2000Error);
  });
});

describe('resolveAgentRef — the site\'s own resolver, never a second source', () => {
  it('builds the URL and maps the row', async () => {
    expect(agentResolveUrl(' #93 ', BASE)).toBe(`${BASE}/agents/resolve?q=%2393`);
    mockFetchQueue([{ json: { address: ADDRESS, numericId: 93, name: 'Atlas' } }]);
    await expect(resolveAgentRef('#93', BASE)).resolves.toEqual({
      address: ADDRESS, numericId: 93, name: 'Atlas',
    });
  });

  it('a miss throws T2000Error with the server sentence (or the fallback)', async () => {
    mockFetchQueue([{ json: { error: 'No agent #9999.' }, ok: false, status: 404 }]);
    await expect(resolveAgentRef('#9999', BASE)).rejects.toMatchObject({
      name: 'T2000Error', code: 'CONTACT_NOT_FOUND', message: 'No agent #9999.',
    });
    mockFetchQueue([{ json: {}, ok: false, status: 404 }]);
    await expect(resolveAgentRef('nope', BASE)).rejects.toThrow(/Agent ID \(#93\)/);
  });
});

describe('planPackage — three tiers, one name, slugs from the shared math', () => {
  const input = {
    name: 'Market report',
    description: 'Daily research on any Sui token',
    requirements: 'Token symbol or coin type',
    slaMinutes: 1440,
    tiers: [
      { tier: 'premium' as const, priceUsdc: 25, deliverable: '10 pages + call' },
      { tier: 'basic' as const, priceUsdc: 5, deliverable: '2 pages' },
      { tier: 'standard' as const, priceUsdc: 12, deliverable: '5 pages', slaMinutes: 2880 },
    ],
  };

  it('orders basic → standard → premium with mode create and tier-own fields', () => {
    const plan = planPackage(input);
    expect(plan.base).toBe('market-report');
    expect(plan.tiers.map((t) => t.slug)).toEqual([
      'market-report-basic', 'market-report-standard', 'market-report-premium',
    ]);
    expect(plan.tiers.map((t) => t.input.priceUsdc)).toEqual([5, 12, 25]);
    expect(plan.tiers.map((t) => t.input.slaMinutes)).toEqual([1440, 2880, 1440]);
    expect(plan.tiers.every((t) => t.input.mode === 'create')).toBe(true);
    expect(plan.tiers.every((t) => t.input.name === 'Market report')).toBe(true);
  });

  it('refuses a missing or duplicated tier, and an unusable name', () => {
    expect(() => planPackage({ ...input, tiers: input.tiers.slice(0, 2) })).toThrow(/missing: standard/);
    expect(() =>
      planPackage({ ...input, tiers: [...input.tiers, input.tiers[1]] }),
    ).toThrow(/given twice/);
    expect(() => planPackage({ ...input, name: '!!!' })).toThrow(/baseSlug/);
  });

  it('truncates a long name to the 39-char base budget', () => {
    const plan = planPackage({ ...input, name: 'x'.repeat(80) });
    expect(plan.base).toHaveLength(39);
    expect(plan.tiers[1].slug.length).toBeLessThanOrEqual(48);
  });
});

describe('CommerceClient — the wire, end to end with a stub signer', () => {
  it('register: prepare → guard → sign → submit (and idempotent short-circuit)', async () => {
    const { signer, signed } = stubSigner();
    const guardCalls: unknown[] = [];
    setSponsoredTxGuard((ctx) => guardCalls.push(ctx));
    const calls = mockFetchQueue([
      { json: { regNonce: 'r-1', txBytes: TX_BYTES } },
      { json: { digest: 'D1' } },
      { json: { alreadyRegistered: true } },
    ]);
    const client = new CommerceClient({ signer, apiBase: `${BASE}/` });
    expect(client.apiBase).toBe(BASE);
    await expect(client.register()).resolves.toEqual({
      address: ADDRESS, alreadyRegistered: false, digest: 'D1',
    });
    expect(calls[0]).toMatchObject({ url: `${BASE}/agent/register/prepare`, body: { address: ADDRESS } });
    expect(calls[1]).toMatchObject({
      url: `${BASE}/agent/register/submit`,
      body: { regNonce: 'r-1', address: ADDRESS, agentSignature: 'tx-sig' },
    });
    expect(signed.tx).toEqual(['sponsored-tx']);
    expect(guardCalls).toEqual([
      { base: BASE, action: 'register' },
      { base: BASE, action: 'register', txBytes: TX_BYTES },
    ]);
    await expect(client.register()).resolves.toEqual({ address: ADDRESS, alreadyRegistered: true });
    expect(signed.tx).toHaveLength(1);
  });

  it('a guard veto aborts before the address is sent', async () => {
    const { signer } = stubSigner();
    setSponsoredTxGuard(() => {
      throw new Error('untrusted host');
    });
    const calls = mockFetchQueue([]);
    await expect(new CommerceClient({ signer, apiBase: BASE }).register()).rejects.toThrow(/untrusted/);
    expect(calls).toHaveLength(0);
  });

  it('updateProfile: challenge → signed profile message → POST (category validated locally)', async () => {
    const { signer, signed } = stubSigner();
    const calls = mockFetchQueue([{ json: { nonce: 'n-p' } }, { json: { ok: true } }]);
    const client = new CommerceClient({ signer, apiBase: BASE });
    await client.updateProfile({ name: 'Atlas', category: 'Research' });
    expect(signed.messages).toEqual(['t2000-agent-profile:n-p']);
    expect(calls[1]).toMatchObject({
      url: `${BASE}/agent/profile`,
      body: { address: ADDRESS, nonce: 'n-p', signature: 'msg-sig', displayName: 'Atlas', category: 'research' },
    });
    await expect(client.updateProfile({ category: 'bogus' })).rejects.toThrow(/category must be one of/);
    await expect(client.updateProfile({})).rejects.toThrow(/at least one/);
  });

  it('upsertService: the signed message binds the payload hash; API errors become T2000Error', async () => {
    const { signer, signed } = stubSigner();
    const calls = mockFetchQueue([
      { json: { nonce: 'n-s' } },
      { json: { ok: true, slug: 'logo-sketch' } },
    ]);
    const client = new CommerceClient({ signer, apiBase: BASE });
    const r = await client.upsertService({
      slug: 'logo-sketch', name: 'Logo sketch', description: 'd', priceUsdc: 5,
      slaMinutes: 1440, deliverable: 'PNG', requirements: 'brand', mode: 'create',
    });
    const payload = calls[1].body?.payload as Record<string, unknown>;
    const hash = createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
    expect(signed.messages).toEqual([`t2000-agent-service:n-s:${hash}`]);
    expect(calls[1].body).toMatchObject({ address: ADDRESS, action: 'upsert' });
    expect(payload.mode).toBe('create');
    expect(r).toMatchObject({ address: ADDRESS, slug: 'logo-sketch' });

    mockFetchQueue([
      { json: { nonce: 'n-2' } },
      { json: { error: { message: 'Slug "logo-sketch" is live — pick another name.' } }, ok: false, status: 409 },
    ]);
    await expect(client.retireService('logo-sketch')).rejects.toMatchObject({
      name: 'T2000Error', code: 'INVALID_INPUT', message: /is live/,
    });
  });

  it('createPackage: three sequential creates, collision on the second stops the set', async () => {
    const { signer } = stubSigner();
    const calls = mockFetchQueue([
      { json: { nonce: 'n-a' } }, { json: { ok: true } },
      { json: { nonce: 'n-b' } }, { json: { error: 'live slug' }, ok: false, status: 409 },
    ]);
    const client = new CommerceClient({ signer, apiBase: BASE });
    await expect(
      client.createPackage({
        name: 'Market report', description: 'd', requirements: 'r', slaMinutes: 60,
        tiers: [
          { tier: 'basic', priceUsdc: 5, deliverable: 'a' },
          { tier: 'standard', priceUsdc: 12, deliverable: 'b' },
          { tier: 'premium', priceUsdc: 25, deliverable: 'c' },
        ],
      }),
    ).rejects.toThrow(/live slug/);
    const upserts = calls.filter((c) => c.url.endsWith('/agent/service'));
    expect(upserts.map((c) => (c.body?.payload as { slug: string }).slug)).toEqual([
      'market-report-basic', 'market-report-standard',
    ]);
  });

  it('listEndpoint: probe failure carries per-route findings; success returns the CLI JSON shape', async () => {
    const { signer } = stubSigner();
    mockFetchQueue([
      {
        ok: false, status: 400,
        json: {
          error: { message: 'Probe failed.' },
          routes: [{ method: 'POST', path: '/v1/x', probeOk: false, issues: [{ message: 'no 402' }] }],
        },
      },
    ]);
    const client = new CommerceClient({ signer, apiBase: BASE });
    await expect(client.listEndpoint('https://api.me.test')).rejects.toThrow(
      'Probe failed.\n  ✗ POST /v1/x\n      no 402',
    );
    expect(endpointIssueLines({ probe: { issues: [{ code: 'E1' }] } })).toEqual(['  ✗ E1']);

    const calls = mockFetchQueue([
      {
        json: {
          nonce: 'e-1', txBytes: TX_BYTES, origin: 'https://api.me.test',
          primary: { path: '/v1/x', url: 'https://api.me.test/v1/x' },
          routes: [{ method: 'POST', path: '/v1/x', priceUsdc: '0.01', probeOk: true }],
          probe: { ok: true, amount: '0.01' },
        },
      },
      { json: { digest: 'E-D' } },
    ]);
    const listing = await client.listEndpoint('https://api.me.test', { primary: '/v1/x' });
    expect(calls[0].body).toEqual({ address: ADDRESS, endpoint: 'https://api.me.test', primary: '/v1/x' });
    expect(calls[1].body).toEqual({ nonce: 'e-1', address: ADDRESS, signature: 'tx-sig' });
    expect(listing).toMatchObject({
      address: ADDRESS, endpoint: 'https://api.me.test/v1/x', listed: true,
      origin: 'https://api.me.test', digest: 'E-D',
    });
    expect(listing.routes).toHaveLength(1);

    mockFetchQueue([{ json: { nonce: 'e-2', txBytes: TX_BYTES } }, { json: { digest: 'E-R' } }]);
    await expect(client.removeEndpoint()).resolves.toMatchObject({ endpoint: null, listed: false, digest: 'E-R' });
  });
});
