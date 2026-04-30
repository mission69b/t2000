import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSuinsTool } from '../tools/resolve-suins.js';
import { SuinsRpcError } from '../sui-address.js';
import type { ToolContext } from '../types.js';

const RESOLVED_ADDR = `0x${'b'.repeat(64)}`;

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

describe('resolve_suins tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preflight passes for valid SuiNS names', () => {
    const result = resolveSuinsTool.preflight!({ name: 'alex.sui' });
    expect(result.valid).toBe(true);
  });

  it('preflight rejects names without .sui', () => {
    const result = resolveSuinsTool.preflight!({ name: 'alex' });
    expect(result.valid).toBe(false);
  });

  it('preflight rejects empty name', () => {
    const result = resolveSuinsTool.preflight!({ name: '' });
    expect(result.valid).toBe(false);
  });

  it('preflight is case-insensitive', () => {
    const result = resolveSuinsTool.preflight!({ name: 'ALEX.SUI' });
    expect(result.valid).toBe(true);
  });

  it('returns the resolved address + registered: true', async () => {
    mockFetchOk({ result: RESOLVED_ADDR });
    const result = await resolveSuinsTool.call({ name: 'obehi.sui' }, ctx());
    expect(result.data).toEqual({
      name: 'obehi.sui',
      address: RESOLVED_ADDR,
      registered: true,
    });
    expect(result.displayText).toContain('obehi.sui');
  });

  it('returns address: null + registered: false when name is unregistered', async () => {
    mockFetchOk({ result: null });
    const result = await resolveSuinsTool.call({ name: 'nobody.sui' }, ctx());
    expect(result.data.registered).toBe(false);
    expect(result.data.address).toBeNull();
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
      resolveSuinsTool.call({ name: 'alex.sui' }, ctx()),
    ).rejects.toThrow(SuinsRpcError);
  });

  it('is a read-only auto tool', () => {
    expect(resolveSuinsTool.isReadOnly).toBe(true);
    expect(resolveSuinsTool.permissionLevel).toBe('auto');
  });
});
