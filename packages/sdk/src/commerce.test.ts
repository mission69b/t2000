import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchService, getJobSpec, listServices, putJobSpec } from './commerce.js';

const BASE = 'https://api.example.test/v1';

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => json,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJobSpec — the store is untrusted, the hash is the authority', () => {
  it('returns content whose sha256 matches the requested hash', async () => {
    const content = '{"requirements":{"token":"DEEP"}}';
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    mockFetch({ hash, content });
    await expect(getJobSpec(BASE, hash)).resolves.toBe(content);
  });

  it('accepts a 0x-prefixed hash (the on-chain spec_hash format)', async () => {
    const content = 'free text spec';
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    const fn = mockFetch({ hash, content });
    await expect(getJobSpec(BASE, `0x${hash}`)).resolves.toBe(content);
    expect(fn).toHaveBeenCalledWith(`${BASE}/job/spec/${hash}`, expect.anything());
  });

  it('REJECTS content that does not hash to the requested value (tampered store)', async () => {
    const content = 'the real spec';
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    mockFetch({ hash, content: 'a tampered spec' });
    await expect(getJobSpec(BASE, hash)).rejects.toThrow(/tampered/i);
  });
});

describe('putJobSpec', () => {
  it('returns the server-computed hash', async () => {
    mockFetch({ hash: 'ab'.repeat(32) });
    await expect(putJobSpec(BASE, '{"a":1}')).resolves.toBe('ab'.repeat(32));
  });

  it('throws when the server omits the hash', async () => {
    mockFetch({});
    await expect(putJobSpec(BASE, 'x')).rejects.toThrow(/failed to store/i);
  });
});

describe('fetchService — the buy-path resolver', () => {
  const agent = `0x${'1'.repeat(64)}`;
  const listing = {
    agent,
    agentName: 'Research Bot',
    agentNumericId: 7,
    slug: 'sui-market-report',
    name: 'Sui market report',
    description: 'Daily research report',
    priceUsdc: 5,
    slaMinutes: 1440,
    reviewWindowMinutes: 1440,
    rejectSplitBps: 8000,
    requirements: { token: 'string' },
    deliverable: 'PDF report',
    retired: false,
  };

  it('resolves a live service by slug (case-insensitive)', async () => {
    mockFetch({ services: [listing] });
    await expect(fetchService(BASE, agent, 'SUI-Market-Report')).resolves.toMatchObject({
      slug: 'sui-market-report',
      priceUsdc: 5,
    });
  });

  it('rejects a retired service', async () => {
    mockFetch({ services: [{ ...listing, retired: true }] });
    await expect(fetchService(BASE, agent, 'sui-market-report')).rejects.toThrow(/retired/i);
  });

  it('lists the live slugs when the requested one is missing', async () => {
    mockFetch({ services: [listing] });
    await expect(fetchService(BASE, agent, 'nope')).rejects.toThrow(/sui-market-report/);
  });
});

describe('listServices — browse/list filter plumbing', () => {
  it('passes agent + query as URL params and returns total', async () => {
    const fn = mockFetch({ total: 3, services: [] });
    const agent = `0x${'2'.repeat(64)}`;
    await expect(listServices(BASE, { agent, query: 'market report' })).resolves.toEqual({
      total: 3,
      services: [],
    });
    const url = (fn.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain(`agent=${encodeURIComponent(agent)}`);
    expect(url).toContain('q=market+report');
  });

  it('passes category + limit/offset (S.1041 — directory bucket + paging)', async () => {
    const fn = mockFetch({ total: 0, services: [] });
    await listServices(BASE, { category: 'creative', limit: 20, offset: 40 });
    const url = (fn.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain('category=creative');
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=40');
    expect(url).not.toContain('q=');
  });
});

describe('assertBuyerRequirements — the shared hire gate (SPEC_ACP_JOB_SPEC_V1 §4.1)', () => {
  const gate = async (listing: unknown, payload: unknown) => {
    const { assertBuyerRequirements } = await import('./commerce.js');
    return () => assertBuyerRequirements(listing, payload);
  };

  it('null listing → anything passes, including omission', async () => {
    expect((await gate(null, undefined))).not.toThrow();
    expect((await gate(undefined, null))).not.toThrow();
    expect((await gate(null, { extra: 'fine' }))).not.toThrow();
  });

  it('object listing → every key present and trim-non-empty', async () => {
    const listing = { url: 'https://… — the page to rewrite', audience: 'who reads it' };
    expect((await gate(listing, { url: 'https://a.io', audience: 'devs' }))).not.toThrow();
  });

  it('object listing → missing key fails closed, echoing key + hint', async () => {
    const listing = { url: 'the page to rewrite' };
    expect((await gate(listing, {}))).toThrow(/Missing required field\(s\): url/);
    expect((await gate(listing, {}))).toThrow(/the page to rewrite/);
  });

  it('object listing → present-but-empty (whitespace) key fails', async () => {
    expect((await gate({ email: 'where we send it' }, { email: '   ' }))).toThrow(
      /Missing required field\(s\): email/,
    );
  });

  it('object listing → EXTRA buyer keys are allowed', async () => {
    expect(
      (await gate({ url: 'page' }, { url: 'https://a.io', tone: 'formal' })),
    ).not.toThrow();
  });

  it('{ properties: {…} } wrapper unwraps to the field map', async () => {
    const listing = { properties: { token: 'symbol to analyze' } };
    expect((await gate(listing, { token: 'DEEP' }))).not.toThrow();
    expect((await gate(listing, { other: 'x' }))).toThrow(
      /Missing required field\(s\): token/,
    );
  });

  it('object listing → non-object payload rejected with the expected keys', async () => {
    expect((await gate({ url: 'page' }, 'just text'))).toThrow(/JSON requirements object/);
    expect((await gate({ url: 'page' }, 'just text'))).toThrow(/url/);
  });

  it('empty-object listing asks for nothing', async () => {
    expect((await gate({}, undefined))).not.toThrow();
  });

  it('string listing → non-empty string passes, empty/omitted fails', async () => {
    expect((await gate('describe your token', 'DEEP, the whole book'))).not.toThrow();
    expect((await gate('describe your token', ''))).toThrow(/needs requirements/);
    expect((await gate('describe your token', undefined))).toThrow(/describe your token/);
  });

  it('string listing → scalar payloads stringify (the eager-JSON.parse case)', async () => {
    expect((await gate('how many pages?', 123))).not.toThrow();
    expect((await gate('yes or no?', true))).not.toThrow();
  });

  it('string listing → object payload is a shape mismatch', async () => {
    expect((await gate('free text please', { url: 'https://a.io' }))).toThrow(
      /free-text requirements, not JSON/,
    );
  });
});

describe('assertBuyerRequirements — JSON-Schema listings with a required array (live #80 shape)', () => {
  const LISTING = {
    type: 'object',
    required: ['url', 'audience'],
    properties: {
      url: { type: 'string', description: 'Public homepage URL' },
      audience: { type: 'string', description: 'Primary buyer' },
      constraints: { type: 'string', description: 'Optional tone constraints' },
    },
  };
  const gate = async (payload: unknown) => {
    const { assertBuyerRequirements } = await import('./commerce.js');
    return () => assertBuyerRequirements(LISTING, payload);
  };

  it('optional properties may be omitted or empty', async () => {
    expect((await gate({ url: 'https://a.io', audience: 'devs' }))).not.toThrow();
    expect(
      (await gate({ url: 'https://a.io', audience: 'devs', constraints: '' })),
    ).not.toThrow();
  });

  it('required keys still enforce, with the schema DESCRIPTION as the hint', async () => {
    expect((await gate({ url: 'https://a.io' }))).toThrow(
      /Missing required field\(s\): audience/,
    );
    expect((await gate({ url: 'https://a.io' }))).toThrow(/Primary buyer/);
  });

  it('a plain field map whose value is literally named "required" is untouched', async () => {
    const { assertBuyerRequirements } = await import('./commerce.js');
    expect(() =>
      assertBuyerRequirements({ required: 'what you must have' }, { required: 'a wallet' }),
    ).not.toThrow();
    expect(() =>
      assertBuyerRequirements({ required: 'what you must have' }, {}),
    ).toThrow(/Missing required field\(s\): required/);
  });
});
