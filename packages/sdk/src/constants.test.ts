import { describe, it, expect } from 'vitest';
import {
  OPERATION_ASSETS,
  isAllowedAsset,
  assertAllowedAsset,
} from './constants.js';
import { T2000Error } from './errors.js';

describe('OPERATION_ASSETS', () => {
  it('restricts save to USDC only', () => {
    expect(OPERATION_ASSETS.save).toEqual(['USDC']);
  });

  it('restricts borrow to USDC only', () => {
    expect(OPERATION_ASSETS.borrow).toEqual(['USDC']);
  });

  it('allows any asset for withdraw, repay, send, swap', () => {
    expect(OPERATION_ASSETS.withdraw).toBe('*');
    expect(OPERATION_ASSETS.repay).toBe('*');
    expect(OPERATION_ASSETS.send).toBe('*');
    expect(OPERATION_ASSETS.swap).toBe('*');
  });
});

describe('isAllowedAsset', () => {
  it('returns true for USDC on save', () => {
    expect(isAllowedAsset('save', 'USDC')).toBe(true);
  });

  it('returns true for lowercase usdc on save (case-insensitive)', () => {
    expect(isAllowedAsset('save', 'usdc')).toBe(true);
  });

  it('returns false for USDT on save', () => {
    expect(isAllowedAsset('save', 'USDT')).toBe(false);
  });

  it('returns false for SUI on save', () => {
    expect(isAllowedAsset('save', 'SUI')).toBe(false);
  });

  it('returns false for USDT on borrow', () => {
    expect(isAllowedAsset('borrow', 'USDT')).toBe(false);
  });

  it('returns true for any asset on wildcard operations', () => {
    for (const op of ['withdraw', 'repay', 'send', 'swap'] as const) {
      expect(isAllowedAsset(op, 'USDC')).toBe(true);
      expect(isAllowedAsset(op, 'USDT')).toBe(true);
      expect(isAllowedAsset(op, 'SUI')).toBe(true);
      expect(isAllowedAsset(op, 'ETH')).toBe(true);
      expect(isAllowedAsset(op, 'RANDOM')).toBe(true);
    }
  });
});

describe('assertAllowedAsset', () => {
  it('does nothing when asset is undefined (defaults to USDC)', () => {
    expect(() => assertAllowedAsset('save', undefined)).not.toThrow();
    expect(() => assertAllowedAsset('borrow', undefined)).not.toThrow();
  });

  it('does nothing for USDC on save', () => {
    expect(() => assertAllowedAsset('save', 'USDC')).not.toThrow();
  });

  it('does nothing for USDC on borrow', () => {
    expect(() => assertAllowedAsset('borrow', 'USDC')).not.toThrow();
  });

  it('throws T2000Error with INVALID_ASSET for USDT on save', () => {
    expect(() => assertAllowedAsset('save', 'USDT')).toThrow(T2000Error);
    try {
      assertAllowedAsset('save', 'USDT');
    } catch (e) {
      const err = e as T2000Error;
      expect(err.code).toBe('INVALID_ASSET');
      expect(err.message).toContain('save only supports USDC');
      expect(err.message).toContain('Cannot use USDT');
      expect(err.message).toContain('Swap to USDC first');
    }
  });

  it('throws for SUI on borrow without swap hint', () => {
    try {
      assertAllowedAsset('borrow', 'SUI');
    } catch (e) {
      const err = e as T2000Error;
      expect(err.code).toBe('INVALID_ASSET');
      expect(err.message).toContain('borrow only supports USDC');
      expect(err.message).not.toContain('Swap to USDC first');
    }
  });

  it('does not throw for any asset on wildcard operations', () => {
    for (const op of ['withdraw', 'repay', 'send', 'swap'] as const) {
      expect(() => assertAllowedAsset(op, 'USDT')).not.toThrow();
      expect(() => assertAllowedAsset(op, 'SUI')).not.toThrow();
      expect(() => assertAllowedAsset(op, 'ETH')).not.toThrow();
    }
  });
});
