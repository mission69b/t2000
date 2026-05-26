import { describe, it, expect } from 'vitest';
import {
  OPERATION_ASSETS,
  isAllowedAsset,
  assertAllowedAsset,
  STABLE_ASSETS,
  SAVEABLE_ASSETS,
  type StableAsset,
  type SaveableAsset,
} from './constants.js';
import { T2000Error } from './errors.js';

// [SPEC_AGENTIC_STACK P1 / SDK F3 + F4 — 2026-05-25]
// Phase 1 widened STABLE_ASSETS (USDC → USDC + USDsui) and added a new
// SAVEABLE_ASSETS export. These tests pin both sets so future widenings of
// either don't silently leak into the other (e.g. USDe joining STABLE_ASSETS
// without a NAVI pool would NOT belong in SAVEABLE_ASSETS until the pool is live).
describe('STABLE_ASSETS', () => {
  it('contains exactly USDC + USDsui', () => {
    expect(STABLE_ASSETS).toEqual(['USDC', 'USDsui']);
  });

  it('is readonly at the type level', () => {
    const assets: readonly StableAsset[] = STABLE_ASSETS;
    expect(assets.length).toBe(2);
  });

  it('every entry matches the StableAsset union', () => {
    for (const a of STABLE_ASSETS) {
      const narrow: StableAsset = a;
      expect(['USDC', 'USDsui']).toContain(narrow);
    }
  });
});

describe('SAVEABLE_ASSETS', () => {
  it('contains exactly USDC + USDsui (NAVI-pool-backed stables)', () => {
    expect(SAVEABLE_ASSETS).toEqual(['USDC', 'USDsui']);
  });

  it('matches OPERATION_ASSETS.save (single source of truth)', () => {
    expect(SAVEABLE_ASSETS).toEqual(OPERATION_ASSETS.save);
  });

  it('matches OPERATION_ASSETS.borrow (saveable == borrowable today)', () => {
    expect(SAVEABLE_ASSETS).toEqual(OPERATION_ASSETS.borrow);
  });

  it('every entry matches the SaveableAsset union', () => {
    for (const a of SAVEABLE_ASSETS) {
      const narrow: SaveableAsset = a;
      expect(['USDC', 'USDsui']).toContain(narrow);
    }
  });
});

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

  it('allows any asset for withdraw, repay, swap', () => {
    expect(OPERATION_ASSETS.withdraw).toBe('*');
    expect(OPERATION_ASSETS.repay).toBe('*');
    expect(OPERATION_ASSETS.swap).toBe('*');
  });

  // [v4.0 Phase A Day 2 — SPEC_AGENT_WALLET_GREENFIELD §A]
  // `send` constrained from `'*'` to the gasless-eligible stables (USDC,
  // USDsui) plus SUI (for gas-native transfers). Other assets must be
  // swapped first.
  it('restricts send to USDC + USDsui + SUI', () => {
    expect(OPERATION_ASSETS.send).toEqual(['USDC', 'USDsui', 'SUI']);
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

  it('returns true for any asset on wildcard operations (withdraw, repay, swap)', () => {
    for (const op of ['withdraw', 'repay', 'swap'] as const) {
      expect(isAllowedAsset(op, 'USDC')).toBe(true);
      expect(isAllowedAsset(op, 'USDT')).toBe(true);
      expect(isAllowedAsset(op, 'SUI')).toBe(true);
      expect(isAllowedAsset(op, 'ETH')).toBe(true);
      expect(isAllowedAsset(op, 'RANDOM')).toBe(true);
    }
  });

  // [v4.0 Phase A Day 2] send is no longer wildcard — restricted to USDC,
  // USDsui, SUI. Everything else must be swapped first.
  it('returns true for USDC + USDsui + SUI on send, false for other assets', () => {
    expect(isAllowedAsset('send', 'USDC')).toBe(true);
    expect(isAllowedAsset('send', 'USDsui')).toBe(true);
    expect(isAllowedAsset('send', 'SUI')).toBe(true);
    expect(isAllowedAsset('send', 'usdc')).toBe(true);
    expect(isAllowedAsset('send', 'usdsui')).toBe(true);
    expect(isAllowedAsset('send', 'USDT')).toBe(false);
    expect(isAllowedAsset('send', 'USDe')).toBe(false);
    expect(isAllowedAsset('send', 'WAL')).toBe(false);
    expect(isAllowedAsset('send', 'ETH')).toBe(false);
    expect(isAllowedAsset('send', 'NAVX')).toBe(false);
    expect(isAllowedAsset('send', 'GOLD')).toBe(false);
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

  it('does not throw for any asset on wildcard operations (withdraw, repay, swap)', () => {
    for (const op of ['withdraw', 'repay', 'swap'] as const) {
      expect(() => assertAllowedAsset(op, 'USDT')).not.toThrow();
      expect(() => assertAllowedAsset(op, 'SUI')).not.toThrow();
      expect(() => assertAllowedAsset(op, 'ETH')).not.toThrow();
    }
  });

  // [v4.0 Phase A Day 2] send is no longer wildcard.
  it('does not throw for USDC, USDsui, SUI on send', () => {
    expect(() => assertAllowedAsset('send', 'USDC')).not.toThrow();
    expect(() => assertAllowedAsset('send', 'USDsui')).not.toThrow();
    expect(() => assertAllowedAsset('send', 'SUI')).not.toThrow();
  });

  it('throws T2000Error with INVALID_ASSET for USDT on send + hints at swap path', () => {
    expect(() => assertAllowedAsset('send', 'USDT')).toThrow(T2000Error);
    try {
      assertAllowedAsset('send', 'USDT');
    } catch (e) {
      const err = e as T2000Error;
      expect(err.code).toBe('INVALID_ASSET');
      expect(err.message).toContain('send only supports USDC, USDsui, SUI');
      expect(err.message).toContain('Cannot use USDT');
      expect(err.message).toContain('Swap to USDC or USDsui first, or send SUI');
    }
  });

  it('throws for WAL / ETH / NAVX / GOLD on send', () => {
    for (const asset of ['WAL', 'ETH', 'NAVX', 'GOLD'] as const) {
      expect(() => assertAllowedAsset('send', asset)).toThrow(T2000Error);
    }
  });
});
