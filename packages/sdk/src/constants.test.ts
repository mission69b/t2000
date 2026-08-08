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

// [NAVI removed] The only live operations are `send` and `swap`.
// [S.957] BOTH are wildcards now — send widened to any resolvable coin type;
// the real send gate is `classifySendAsset` (wallet/send.ts), which still
// hard-fails unresolvable symbols.
describe('OPERATION_ASSETS', () => {
  it('allows any asset for send (resolvability gated in wallet/send.ts)', () => {
    expect(OPERATION_ASSETS.send).toBe('*');
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

  it('returns true for any asset on send (S.957 wildcard)', () => {
    for (const asset of ['USDC', 'USDsui', 'SUI', 'usdc', 'USDT', 'WAL', 'MANIFEST']) {
      expect(isAllowedAsset('send', asset)).toBe(true);
    }
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

  it('does not throw for registry alts on send (S.957 — gate moved to classifySendAsset)', () => {
    for (const asset of ['USDT', 'WAL', 'ETH', 'NAVX', 'GOLD', 'MANIFEST'] as const) {
      expect(() => assertAllowedAsset('send', asset)).not.toThrow();
    }
  });
});
