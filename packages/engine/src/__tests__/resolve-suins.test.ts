import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSuinsTool } from '../tools/resolve-suins.js';
import { SuinsRpcError } from '../sui/address.js';
import type { ToolContext } from '../types.js';

const RESOLVED_ADDR = `0x${'b'.repeat(64)}`;
const QUERY_ADDR = `0x${'c'.repeat(64)}`;

function ctx(): ToolContext {
  return {
    walletAddress: `0x${'a'.repeat(64)}`,
    suiRpcUrl: 'https://fullnode.mainnet.sui.io:443',
  } as ToolContext;
}

function mockFetchOk(payload: unknown): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe('resolve_suins tool — preflight', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes for valid SuiNS names', () => {
    const result = resolveSuinsTool.preflight!({ query: 'alex.sui' });
    expect(result.valid).toBe(true);
  });

  it('passes for valid 0x addresses (reverse direction)', () => {
    const result = resolveSuinsTool.preflight!({ query: QUERY_ADDR });
    expect(result.valid).toBe(true);
  });

  it('rejects strings without .sui suffix or 0x prefix', () => {
    const result = resolveSuinsTool.preflight!({ query: 'alex' });
    expect(result.valid).toBe(false);
  });

  it('rejects empty query', () => {
    const result = resolveSuinsTool.preflight!({ query: '' });
    expect(result.valid).toBe(false);
  });

  it('is case-insensitive on names', () => {
    const result = resolveSuinsTool.preflight!({ query: 'ALEX.SUI' });
    expect(result.valid).toBe(true);
  });

  it('is case-insensitive on addresses (0X… variants)', () => {
    const result = resolveSuinsTool.preflight!({ query: QUERY_ADDR.toUpperCase() });
    expect(result.valid).toBe(true);
  });
});

describe('resolve_suins tool — forward (name → address)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the resolved address + registered: true', async () => {
    mockFetchOk({ result: RESOLVED_ADDR });
    const result = await resolveSuinsTool.call({ query: 'obehi.sui' }, ctx());
    expect(result.data).toEqual({
      direction: 'forward',
      query: 'obehi.sui',
      address: RESOLVED_ADDR,
      registered: true,
    });
    expect(result.displayText).toContain('obehi.sui');
  });

  it('returns address: null + registered: false when name is unregistered', async () => {
    mockFetchOk({ result: null });
    const result = await resolveSuinsTool.call({ query: 'nobody.sui' }, ctx());
    const data = result.data as { registered: boolean; address: string | null };
    expect(data.registered).toBe(false);
    expect(data.address).toBeNull();
    expect(result.displayText).toContain('not a registered');
  });

  it('throws SuinsRpcError on RPC failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'unavailable',
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      resolveSuinsTool.call({ query: 'alex.sui' }, ctx()),
    ).rejects.toThrow(SuinsRpcError);
  });
});

describe('resolve_suins tool — reverse (address → names)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the registered names + primary when address has SuiNS records', async () => {
    mockFetchOk({
      result: { data: ['ossy.sui', 'ossy-alt.sui'], nextCursor: null, hasNextPage: false },
    });
    const result = await resolveSuinsTool.call({ query: QUERY_ADDR }, ctx());
    expect(result.data).toEqual({
      direction: 'reverse',
      query: QUERY_ADDR,
      names: ['ossy.sui', 'ossy-alt.sui'],
      primary: 'ossy.sui',
    });
    expect(result.displayText).toContain('ossy.sui');
    expect(result.displayText).toContain('+1 more');
  });

  it('returns empty names + null primary when address has no SuiNS records', async () => {
    mockFetchOk({ result: { data: [], nextCursor: null, hasNextPage: false } });
    const result = await resolveSuinsTool.call({ query: QUERY_ADDR }, ctx());
    const data = result.data as { names: string[]; primary: string | null };
    expect(data.names).toEqual([]);
    expect(data.primary).toBeNull();
    expect(result.displayText).toContain('no SuiNS name registered');
  });

  it('lowercases the query before sending to RPC', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: ['x.sui'], nextCursor: null, hasNextPage: false } }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await resolveSuinsTool.call({ query: QUERY_ADDR.toUpperCase() }, ctx());
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(callArgs[1].body).toContain(QUERY_ADDR.toLowerCase());
  });
});

describe('resolve_suins tool — meta', () => {
  it('is a read-only auto tool', () => {
    expect(resolveSuinsTool.isReadOnly).toBe(true);
    expect(resolveSuinsTool.permissionLevel).toBe('auto');
  });

  it('is cacheable (within-turn dedupe)', () => {
    expect(resolveSuinsTool.cacheable).toBe(true);
  });
});
