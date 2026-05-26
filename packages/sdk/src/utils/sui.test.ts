import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateAddress,
  truncateAddress,
  normalizeCoinType,
  getSuiClient,
  getSuiGrpcClient,
} from './sui.js';
import { DEFAULT_GRPC_URL, DEFAULT_RPC_URL } from '../constants.js';
import { T2000Error } from '../errors.js';

describe('sui utilities', () => {
  describe('validateAddress', () => {
    it('accepts a valid 66-char hex address', () => {
      const addr = '0x' + 'a'.repeat(64);
      const result = validateAddress(addr);
      expect(result).toBe(addr);
    });

    it('normalizes a short address with 0x prefix', () => {
      const result = validateAddress('0x6');
      expect(result).toMatch(/^0x0+6$/);
      expect(result).toHaveLength(66);
    });

    it('throws T2000Error for invalid address', () => {
      expect(() => validateAddress('not-an-address')).toThrow(T2000Error);
    });

    it('throws with INVALID_ADDRESS code', () => {
      try {
        validateAddress('xyz');
      } catch (e) {
        expect(e).toBeInstanceOf(T2000Error);
        expect((e as T2000Error).code).toBe('INVALID_ADDRESS');
      }
    });

    it('accepts the clock object ID', () => {
      const result = validateAddress('0x6');
      expect(result).toBeTruthy();
    });
  });

  describe('truncateAddress', () => {
    it('truncates a long address', () => {
      const addr = '0x' + 'a'.repeat(64);
      const result = truncateAddress(addr);
      expect(result).toBe('0xaaaa...aaaa');
      expect(result.length).toBeLessThan(addr.length);
    });

    it('returns short addresses unchanged', () => {
      expect(truncateAddress('0x6')).toBe('0x6');
    });

    it('returns 10-char addresses unchanged', () => {
      expect(truncateAddress('0x12345678')).toBe('0x12345678');
    });

    it('truncates 11-char addresses', () => {
      expect(truncateAddress('0x123456789')).toBe('0x1234...6789');
    });

    it('preserves first 6 and last 4 characters', () => {
      const addr = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const result = truncateAddress(addr);
      expect(result.startsWith('0xabcd')).toBe(true);
      expect(result.endsWith('7890')).toBe(true);
      expect(result).toContain('...');
    });
  });

  describe('normalizeCoinType', () => {
    // Regression guards for the v0.47.1 BlockVision SUI fix. Pre-fix,
    // BlockVision's `/coin/price/list` silently returned an empty
    // `prices` map for `0x2::sui::SUI`, leaving `token_prices` and
    // `wallet-balance?asset=SUI` returning $0.

    it('normalizes the SUI native coin to its 64-hex long form', () => {
      expect(normalizeCoinType('0x2::sui::SUI')).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      );
    });

    it('is idempotent on already-long coin types', () => {
      const long =
        '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
      expect(normalizeCoinType(long)).toBe(long);
    });

    it('preserves the module + name segments unchanged', () => {
      expect(normalizeCoinType('0x6::clock::Clock')).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000006::clock::Clock',
      );
    });

    it('returns the input unchanged for non-coin-type strings (no triple ::)', () => {
      expect(normalizeCoinType('0x2')).toBe('0x2');
      expect(normalizeCoinType('not-a-coin')).toBe('not-a-coin');
      expect(normalizeCoinType('')).toBe('');
    });

    it('returns the input unchanged when the address segment is malformed', () => {
      expect(normalizeCoinType('foo::bar::Baz')).toBe('foo::bar::Baz');
    });
  });

  describe('client URL resolution (RPC + gRPC env vars)', () => {
    // SPEC_AGENT_WALLET_GREENFIELD locks `T2000_RPC_URL` + `T2000_GRPC_URL`
    // as optional overrides. The Day 6 audit caught that they were
    // documented but unwired — this guards the wire.

    const originalRpc = process.env.T2000_RPC_URL;
    const originalGrpc = process.env.T2000_GRPC_URL;

    afterEach(() => {
      if (originalRpc === undefined) delete process.env.T2000_RPC_URL;
      else process.env.T2000_RPC_URL = originalRpc;
      if (originalGrpc === undefined) delete process.env.T2000_GRPC_URL;
      else process.env.T2000_GRPC_URL = originalGrpc;
    });

    it('getSuiClient returns the default mainnet client when no overrides', () => {
      delete process.env.T2000_RPC_URL;
      const client = getSuiClient();
      expect(client).toBeDefined();
      // Same call returns the cached instance (URL hasn't changed).
      expect(getSuiClient()).toBe(client);
    });

    it('getSuiClient honors explicit rpcUrl arg over env / default', () => {
      const custom = 'https://custom.mainnet.example/rpc';
      const client = getSuiClient(custom);
      // Same URL returns the cached instance.
      expect(getSuiClient(custom)).toBe(client);
      // Different URL returns a different instance.
      expect(getSuiClient(DEFAULT_RPC_URL)).not.toBe(client);
    });

    it('getSuiClient honors T2000_RPC_URL when arg is absent', () => {
      const envUrl = 'https://env.mainnet.example/rpc';
      process.env.T2000_RPC_URL = envUrl;
      const fromEnv = getSuiClient();
      // Explicit arg with the SAME URL resolves to the same cached instance.
      expect(getSuiClient(envUrl)).toBe(fromEnv);
    });

    it('getSuiClient trims whitespace from T2000_RPC_URL', () => {
      process.env.T2000_RPC_URL = '  ';
      const fromEnv = getSuiClient();
      // Whitespace-only env var falls through to the default URL.
      expect(getSuiClient(DEFAULT_RPC_URL)).toBe(fromEnv);
    });

    it('getSuiGrpcClient honors T2000_GRPC_URL when arg is absent', () => {
      const envUrl = 'https://env.mainnet.example/grpc';
      process.env.T2000_GRPC_URL = envUrl;
      const fromEnv = getSuiGrpcClient();
      expect(getSuiGrpcClient(envUrl)).toBe(fromEnv);
    });

    it('getSuiGrpcClient caches per-URL (different URLs → different clients)', () => {
      const a = getSuiGrpcClient('https://a.example/grpc');
      const b = getSuiGrpcClient('https://b.example/grpc');
      expect(a).not.toBe(b);
      // Repeat call with the same URL returns the cached one.
      expect(getSuiGrpcClient('https://a.example/grpc')).toBe(a);
    });

    it('getSuiGrpcClient defaults to DEFAULT_GRPC_URL', () => {
      delete process.env.T2000_GRPC_URL;
      const fromDefault = getSuiGrpcClient();
      expect(getSuiGrpcClient(DEFAULT_GRPC_URL)).toBe(fromDefault);
    });
  });
});
