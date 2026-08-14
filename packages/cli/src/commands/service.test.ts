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

  it('category (S.1041) ANDs onto any scope — bare, text, and agent', async () => {
    const bare = await resolveServicesQuery(BASE, undefined, 'creative');
    expect(bare.url).toBe(`${BASE}/services?category=creative`);
    const text = await resolveServicesQuery(BASE, 'logo', 'creative');
    expect(text.url).toBe(`${BASE}/services?q=logo&category=creative`);
    const agent = await resolveServicesQuery(BASE, ADDR, 'creative');
    expect(agent.url).toBe(
      `${BASE}/services?agent=${encodeURIComponent(ADDR)}&category=creative`,
    );
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

// [S.1038b] `t2 service create` price bounds — the symmetric max joined the
// existing min preflight; both refuse BEFORE wallet load (dist harness,
// same pattern as agent/create.test.ts). Bounds come from @t2000/sdk
// MIN/MAX_JOB_USDC — never a second hardcoded number.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll } from 'vitest';
import { MAX_JOB_USDC, MIN_JOB_USDC } from '@t2000/sdk';

const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const describeOrSkip = existsSync(CLI) ? describe : describe.skip;

function runCli(
  args: string[],
  home: string,
): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [CLI, ...args], {
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? -1,
  };
}

describeOrSkip('t2 service create — price bounds (S.1038b)', () => {
  let home: string;
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'cli-svc-'));
  });
  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const base = [
    'service',
    'create',
    '--name',
    'Smoke',
    '--sla',
    '24h',
    '--description',
    'd',
    '--deliverable',
    'x',
    '--requirements',
    'Topic and angle; target word count; tone; platform.',
  ];

  it(`rejects --price above MAX_JOB_USDC (${MAX_JOB_USDC}) before any side effect`, () => {
    const r = runCli([...base, '--price', String(MAX_JOB_USDC + 1)], home);
    expect(r.code).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('at most');
  });

  it(`rejects --price below MIN_JOB_USDC (${MIN_JOB_USDC}) before any side effect`, () => {
    const r = runCli([...base, '--price', String(MIN_JOB_USDC / 5)], home);
    expect(r.code).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('at least');
  });
});
