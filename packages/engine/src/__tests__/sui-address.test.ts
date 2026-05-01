import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeAddressInput,
  resolveSuinsViaRpc,
  resolveAddressToSuinsViaRpc,
  looksLikeSuiNs,
  SUI_ADDRESS_REGEX,
  SUI_ADDRESS_STRICT_REGEX,
  SUINS_NAME_REGEX,
  InvalidAddressError,
  SuinsNotRegisteredError,
  SuinsRpcError,
} from '../sui-address.js';

const FULL_ADDR = `0x${'a'.repeat(64)}`;
const RESOLVED_ADDR = `0x${'b'.repeat(64)}`;

function mockFetchOk(payload: unknown): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

function mockFetchHttpError(status: number): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status,
    statusText: 'Server Error',
    json: async () => ({}),
  })) as unknown as typeof fetch;
}

function mockFetchThrows(err: Error): void {
  globalThis.fetch = vi.fn(async () => {
    throw err;
  }) as unknown as typeof fetch;
}

describe('SUI_ADDRESS_REGEX (loose)', () => {
  it('accepts a full 64-hex address', () => {
    expect(SUI_ADDRESS_REGEX.test(FULL_ADDR)).toBe(true);
  });
  it('accepts mixed case hex', () => {
    expect(SUI_ADDRESS_REGEX.test('0xAbCd1234')).toBe(true);
  });
  it('rejects names', () => {
    expect(SUI_ADDRESS_REGEX.test('alex.sui')).toBe(false);
  });
  it('rejects bare hex without 0x prefix', () => {
    expect(SUI_ADDRESS_REGEX.test('a'.repeat(64))).toBe(false);
  });
  it('rejects empty string', () => {
    expect(SUI_ADDRESS_REGEX.test('')).toBe(false);
  });
});

describe('SUI_ADDRESS_STRICT_REGEX', () => {
  it('accepts a full 64-hex address', () => {
    expect(SUI_ADDRESS_STRICT_REGEX.test(FULL_ADDR)).toBe(true);
  });
  it('rejects short addresses', () => {
    expect(SUI_ADDRESS_STRICT_REGEX.test('0xab')).toBe(false);
  });
});

describe('SUINS_NAME_REGEX', () => {
  it('accepts a single-label name', () => {
    expect(SUINS_NAME_REGEX.test('alex.sui')).toBe(true);
  });
  it('accepts hyphens and digits', () => {
    expect(SUINS_NAME_REGEX.test('alex-2.sui')).toBe(true);
  });
  it('accepts nested labels', () => {
    expect(SUINS_NAME_REGEX.test('team.alex.sui')).toBe(true);
  });
  it('rejects uppercase (caller is expected to lowercase first)', () => {
    expect(SUINS_NAME_REGEX.test('Alex.sui')).toBe(false);
  });
  it('rejects names without .sui', () => {
    expect(SUINS_NAME_REGEX.test('alex')).toBe(false);
    expect(SUINS_NAME_REGEX.test('alex.eth')).toBe(false);
  });
  it('rejects underscores', () => {
    expect(SUINS_NAME_REGEX.test('alex_2.sui')).toBe(false);
  });
});

describe('looksLikeSuiNs', () => {
  it('handles trim + case', () => {
    expect(looksLikeSuiNs('  Alex.SUI  ')).toBe(true);
  });
  it('returns false for 0x addresses', () => {
    expect(looksLikeSuiNs(FULL_ADDR)).toBe(false);
  });
  it('returns false for empty / null', () => {
    expect(looksLikeSuiNs('')).toBe(false);
    expect(looksLikeSuiNs('     ')).toBe(false);
  });
});

describe('resolveSuinsViaRpc', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the resolved address on success', async () => {
    mockFetchOk({ result: RESOLVED_ADDR });
    const result = await resolveSuinsViaRpc('obehi.sui');
    expect(result).toBe(RESOLVED_ADDR);
  });

  it('returns null when the name is not registered (result === null)', async () => {
    mockFetchOk({ result: null });
    const result = await resolveSuinsViaRpc('nobody.sui');
    expect(result).toBeNull();
  });

  it('throws SuinsRpcError on HTTP failure', async () => {
    mockFetchHttpError(503);
    await expect(resolveSuinsViaRpc('alex.sui')).rejects.toThrow(SuinsRpcError);
  });

  it('throws SuinsRpcError when fetch itself throws', async () => {
    mockFetchThrows(new Error('AbortError'));
    await expect(resolveSuinsViaRpc('alex.sui')).rejects.toThrow(SuinsRpcError);
  });

  it('throws SuinsRpcError when JSON-RPC returns an error envelope', async () => {
    mockFetchOk({ error: { code: -32602, message: 'invalid params' } });
    await expect(resolveSuinsViaRpc('alex.sui')).rejects.toThrow(SuinsRpcError);
  });

  it('throws InvalidAddressError on malformed names (RPC never called)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await expect(resolveSuinsViaRpc('not-a-sui-name')).rejects.toThrow(InvalidAddressError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('normalizeAddressInput', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes through a 0x address (lowercased)', async () => {
    const input = `0x${'A'.repeat(64)}`;
    const result = await normalizeAddressInput(input);
    expect(result.address).toBe(input.toLowerCase());
    expect(result.suinsName).toBeNull();
    expect(result.raw).toBe(input);
  });

  it('trims whitespace from 0x addresses', async () => {
    const result = await normalizeAddressInput(`  ${FULL_ADDR}  `);
    expect(result.address).toBe(FULL_ADDR);
    expect(result.raw).toBe(`  ${FULL_ADDR}  `);
  });

  it('resolves a SuiNS name to a 0x address', async () => {
    mockFetchOk({ result: RESOLVED_ADDR });
    const result = await normalizeAddressInput('obehi.sui');
    expect(result.address).toBe(RESOLVED_ADDR.toLowerCase());
    expect(result.suinsName).toBe('obehi.sui');
    expect(result.raw).toBe('obehi.sui');
  });

  it('lowercases the SuiNS name when stamping suinsName', async () => {
    mockFetchOk({ result: RESOLVED_ADDR });
    const result = await normalizeAddressInput('OBEHI.SUI');
    expect(result.suinsName).toBe('obehi.sui');
    expect(result.raw).toBe('OBEHI.SUI');
  });

  it('throws SuinsNotRegisteredError when the name resolves to null', async () => {
    mockFetchOk({ result: null });
    await expect(normalizeAddressInput('nobody.sui')).rejects.toThrow(
      SuinsNotRegisteredError,
    );
  });

  it('throws InvalidAddressError when the input is neither shape', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await expect(normalizeAddressInput('not-an-address')).rejects.toThrow(
      InvalidAddressError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes the rpcUrl through to the resolver', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: RESOLVED_ADDR }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await normalizeAddressInput('obehi.sui', { suiRpcUrl: 'https://custom.rpc.example/v1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://custom.rpc.example/v1',
      expect.any(Object),
    );
  });
});

describe('resolveAddressToSuinsViaRpc — reverse lookup (v1.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the registered SuiNS names for the given address', async () => {
    mockFetchOk({
      result: { data: ['ossy.sui', 'ossy-alt.sui'], nextCursor: null, hasNextPage: false },
    });
    const names = await resolveAddressToSuinsViaRpc(FULL_ADDR);
    expect(names).toEqual(['ossy.sui', 'ossy-alt.sui']);
  });

  it('returns [] when the address has no SuiNS records', async () => {
    mockFetchOk({ result: { data: [], nextCursor: null, hasNextPage: false } });
    const names = await resolveAddressToSuinsViaRpc(FULL_ADDR);
    expect(names).toEqual([]);
  });

  it('returns [] when result is missing entirely', async () => {
    mockFetchOk({ result: undefined });
    const names = await resolveAddressToSuinsViaRpc(FULL_ADDR);
    expect(names).toEqual([]);
  });

  it('throws InvalidAddressError on non-0x input', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await expect(resolveAddressToSuinsViaRpc('not-an-address')).rejects.toThrow(
      InvalidAddressError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lowercases the address before sending to RPC', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: [], nextCursor: null, hasNextPage: false } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await resolveAddressToSuinsViaRpc(FULL_ADDR.toUpperCase());
    const callArgs = fetchSpy.mock.calls[0] as unknown as [string, { body: string }];
    const requestBody = JSON.parse(callArgs[1].body) as { params: string[] };
    expect(requestBody.params[0]).toBe(FULL_ADDR.toLowerCase());
  });

  it('throws SuinsRpcError on HTTP failure', async () => {
    mockFetchHttpError(503);
    await expect(resolveAddressToSuinsViaRpc(FULL_ADDR)).rejects.toThrow(SuinsRpcError);
  });

  it('throws SuinsRpcError on RPC error body', async () => {
    mockFetchOk({ error: { code: -32000, message: 'internal error' } });
    await expect(resolveAddressToSuinsViaRpc(FULL_ADDR)).rejects.toThrow(SuinsRpcError);
  });

  it('throws SuinsRpcError on network throw', async () => {
    mockFetchThrows(new Error('connection refused'));
    await expect(resolveAddressToSuinsViaRpc(FULL_ADDR)).rejects.toThrow(SuinsRpcError);
  });

  it('passes the rpcUrl through to the resolver', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: [], nextCursor: null, hasNextPage: false } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await resolveAddressToSuinsViaRpc(FULL_ADDR, {
      suiRpcUrl: 'https://custom.rpc.example/v1',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://custom.rpc.example/v1',
      expect.any(Object),
    );
  });
});
