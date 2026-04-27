import { describe, it, expect } from 'vitest';
import { validateAddress, truncateAddress, normalizeCoinType } from './sui.js';
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
});
