// [S.1017 — beta #93 round five] `t2 services` principal routing: a 0x /
// #id / @handle query scopes to `?agent=` (free-text `?q=` never matches
// hex — the old path answered "No services match 0x…" for a live seller),
// and every printed row names the principal (#id + address).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { truncateAddress } from '@t2000/sdk';
import { resolveServicesQuery, serviceSellerLabel } from './service.js';

const BASE = 'https://api.t2000.ai/v1';
const ADDR = `0x${'a'.repeat(63)}1`;

describe('resolveServicesQuery (S.1017)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('valid 0x address → ?agent=, never ?q=', async () => {
    const { url, scope } = await resolveServicesQuery(BASE, ADDR);
    expect(url).toBe(`${BASE}/services?agent=${encodeURIComponent(ADDR)}`);
    expect(url).not.toContain('q=');
    expect(scope).toEqual({ kind: 'agent', agent: ADDR });
  });

  it('#N resolves via the directory then scopes to that agent', async () => {
    const fn = vi.fn(async () =>
      new Response(JSON.stringify({ address: ADDR, numericId: 16, name: 'funkii@audric' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fn);
    const { url, scope } = await resolveServicesQuery(BASE, '#16');
    expect(String((fn.mock.calls[0] as unknown[])[0])).toContain('/agents/resolve?q=%2316');
    expect(url).toBe(`${BASE}/services?agent=${encodeURIComponent(ADDR)}`);
    expect(scope).toEqual({ kind: 'agent', agent: ADDR, numericId: 16 });
  });

  it('free text stays a ?q= search; empty = everything', async () => {
    const search = await resolveServicesQuery(BASE, 'crypto analysis');
    expect(search.url).toBe(`${BASE}/services?q=crypto%20analysis`);
    expect(search.scope).toEqual({ kind: 'search', q: 'crypto analysis' });
    const all = await resolveServicesQuery(BASE, undefined);
    expect(all.url).toBe(`${BASE}/services`);
    expect(all.scope).toEqual({ kind: 'all' });
  });

  it('malformed 0x falls back to text search (honest zero-match, not a crash)', async () => {
    const { url, scope } = await resolveServicesQuery(BASE, '0xnothex');
    expect(scope.kind).toBe('search');
    expect(url).toContain('q=0xnothex');
  });
});

describe('serviceSellerLabel (S.1017)', () => {
  it('paints #numericId so near-identical names read as two principals', () => {
    expect(serviceSellerLabel({ agentName: 'Funkii AI', agentNumericId: 2, agent: ADDR })).toBe(
      `Funkii AI #2 ${truncateAddress(ADDR)}`,
    );
  });

  it('honest omit when the id is unknown; unnamed fallback', () => {
    const label = serviceSellerLabel({ agentName: null, agentNumericId: null, agent: ADDR });
    expect(label).toBe(`unnamed ${truncateAddress(ADDR)}`);
    expect(label).not.toContain('#');
  });
});
