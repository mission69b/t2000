import { describe, it, expect } from 'vitest';
import {
  OPERATION_ASSETS,
  isAllowedAsset,
  assertAllowedAsset,
  STABLE_ASSETS,
  type StableAsset,
} from './constants.js';
import { T2000Error } from './errors.js';

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

// [NAVI removed] The only live operations are `send` (gasless-eligible stables
// + SUI) and `swap` (unrestricted — Cetus routes any pair). save / borrow /
// withdraw / repay were removed with the DeFi surface.
describe('OPERATION_ASSETS', () => {
  it('restricts send to USDC + USDsui + SUI', () => {
    expect(OPERATION_ASSETS.send).toEqual(['USDC', 'USDsui', 'SUI']);
  });

  it('allows any asset for swap', () => {
    expect(OPERATION_ASSETS.swap).toBe('*');
  });
});

describe('isAllowedAsset', () => {
  it('returns true for any asset on swap (wildcard)', () => {
    for (const asset of ['USDC', 'USDT', 'SUI', 'ETH', 'RANDOM']) {
      expect(isAllowedAsset('swap', asset)).toBe(true);
    }
  });

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
  it('does nothing when asset is undefined', () => {
    expect(() => assertAllowedAsset('send', undefined)).not.toThrow();
    expect(() => assertAllowedAsset('swap', undefined)).not.toThrow();
  });

  it('does nothing for any asset on swap (wildcard)', () => {
    for (const asset of ['USDT', 'SUI', 'ETH']) {
      expect(() => assertAllowedAsset('swap', asset)).not.toThrow();
    }
  });

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
