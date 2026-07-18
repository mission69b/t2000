import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOffering, getJobSpec, putJobSpec } from './offerings.js';

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

describe('fetchOffering — the buy-path resolver', () => {
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

  it('resolves a live offering by slug (case-insensitive)', async () => {
    mockFetch({ offerings: [listing] });
    await expect(fetchOffering(BASE, agent, 'SUI-Market-Report')).resolves.toMatchObject({
      slug: 'sui-market-report',
      priceUsdc: 5,
    });
  });

  it('rejects a retired offering', async () => {
    mockFetch({ offerings: [{ ...listing, retired: true }] });
    await expect(fetchOffering(BASE, agent, 'sui-market-report')).rejects.toThrow(/retired/i);
  });

  it('lists the live slugs when the requested one is missing', async () => {
    mockFetch({ offerings: [listing] });
    await expect(fetchOffering(BASE, agent, 'nope')).rejects.toThrow(/sui-market-report/);
  });
});
