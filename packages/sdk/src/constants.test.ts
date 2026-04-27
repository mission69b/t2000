import { describe, it, expect } from 'vitest';
import {
  OPERATION_ASSETS,
  isAllowedAsset,
  assertAllowedAsset,
} from './constants.js';
import { T2000Error } from './errors.js';

// [v0.51.0] OPERATION_ASSETS gained USDsui as a strategic exception alongside
// USDC for save + borrow. Every other asset (USDT, USDe, SUI, ETH, GOLD, NAVX,
// WAL) is still rejected. The error message now hints "Swap to USDC or USDsui
// first" because both stables route through the same NAVI lending pools. See
// `.cursor/rules/savings-usdc-only.mdc` for the rationale.
describe('OPERATION_ASSETS', () => {
  it('restricts save to USDC + USDsui', () => {
    expect(OPERATION_ASSETS.save).toEqual(['USDC', 'USDsui']);
  });

  it('restricts borrow to USDC + USDsui', () => {
    expect(OPERATION_ASSETS.borrow).toEqual(['USDC', 'USDsui']);
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

  it('returns true for USDsui on save (strategic exception)', () => {
    expect(isAllowedAsset('save', 'USDsui')).toBe(true);
  });

  it('returns true for lowercase usdc on save (case-insensitive)', () => {
    expect(isAllowedAsset('save', 'usdc')).toBe(true);
  });

  it('returns true for lowercase usdsui on save (case-insensitive)', () => {
    expect(isAllowedAsset('save', 'usdsui')).toBe(true);
  });

  it('returns false for USDT on save (other stable still blocked)', () => {
    expect(isAllowedAsset('save', 'USDT')).toBe(false);
  });

  it('returns false for USDe on save (other stable still blocked)', () => {
    expect(isAllowedAsset('save', 'USDe')).toBe(false);
  });

  it('returns false for SUI on save', () => {
    expect(isAllowedAsset('save', 'SUI')).toBe(false);
  });

  it('returns true for USDC + USDsui on borrow, false for others', () => {
    expect(isAllowedAsset('borrow', 'USDC')).toBe(true);
    expect(isAllowedAsset('borrow', 'USDsui')).toBe(true);
    expect(isAllowedAsset('borrow', 'USDT')).toBe(false);
    expect(isAllowedAsset('borrow', 'ETH')).toBe(false);
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

  it('does nothing for USDsui on save (strategic exception)', () => {
    expect(() => assertAllowedAsset('save', 'USDsui')).not.toThrow();
  });

  it('does nothing for USDC + USDsui on borrow', () => {
    expect(() => assertAllowedAsset('borrow', 'USDC')).not.toThrow();
    expect(() => assertAllowedAsset('borrow', 'USDsui')).not.toThrow();
  });

  it('throws T2000Error with INVALID_ASSET for USDT on save', () => {
    expect(() => assertAllowedAsset('save', 'USDT')).toThrow(T2000Error);
    try {
      assertAllowedAsset('save', 'USDT');
    } catch (e) {
      const err = e as T2000Error;
      expect(err.code).toBe('INVALID_ASSET');
      expect(err.message).toContain('save only supports USDC, USDsui');
      expect(err.message).toContain('Cannot use USDT');
      expect(err.message).toContain('Swap to USDC or USDsui first');
    }
  });

  it('throws for SUI on borrow without swap hint', () => {
    try {
      assertAllowedAsset('borrow', 'SUI');
    } catch (e) {
      const err = e as T2000Error;
      expect(err.code).toBe('INVALID_ASSET');
      expect(err.message).toContain('borrow only supports USDC, USDsui');
      expect(err.message).not.toContain('Swap to USDC or USDsui first');
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
