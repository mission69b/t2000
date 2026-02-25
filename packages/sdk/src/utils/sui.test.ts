import { describe, it, expect } from 'vitest';
import { validateAddress, truncateAddress } from './sui.js';
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
});
