// [SPEC_AGENTIC_STACK P1 / CLI F6 — 2026-05-25]
// Parser unit tests for `t2000 repay --asset`. Unlike save/borrow, repay
// returns `undefined` when --asset is omitted — that means "repay the
// highest-APY borrow" (SDK auto-selects).
import { describe, it, expect } from 'vitest';
import { resolveRepayAsset, REPAY_ASSETS } from './repay.js';

describe('resolveRepayAsset', () => {
  it('returns undefined when --asset is omitted (auto-select)', () => {
    expect(resolveRepayAsset(undefined)).toBeUndefined();
  });

  it('accepts USDC explicitly', () => {
    expect(resolveRepayAsset('USDC')).toBe('USDC');
  });

  it('accepts USDsui explicitly', () => {
    expect(resolveRepayAsset('USDsui')).toBe('USDsui');
  });

  it('is case-insensitive', () => {
    expect(resolveRepayAsset('usdc')).toBe('USDC');
    expect(resolveRepayAsset('usdsui')).toBe('USDsui');
  });

  it('throws for unsupported assets', () => {
    expect(() => resolveRepayAsset('USDT')).toThrow(/USDC, USDsui/);
    expect(() => resolveRepayAsset('SUI')).toThrow(/USDC, USDsui/);
  });

  it('REPAY_ASSETS contains exactly USDC + USDsui', () => {
    expect(REPAY_ASSETS).toEqual(['USDC', 'USDsui']);
  });
});
