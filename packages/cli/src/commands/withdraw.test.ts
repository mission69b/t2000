// [SPEC_AGENTIC_STACK P1 / CLI F6 followup — 2026-05-25]
// Parser unit tests for `t2000 withdraw --asset`. Same shape as `repay` —
// omitting `--asset` returns undefined (auto-detect via SDK), explicit
// `USDC` / `USDsui` resolve to the canonical casing.
import { describe, it, expect } from 'vitest';
import { resolveWithdrawAsset, WITHDRAW_ASSETS } from './withdraw.js';

describe('resolveWithdrawAsset', () => {
  it('returns undefined when --asset is omitted (auto-detect)', () => {
    expect(resolveWithdrawAsset(undefined)).toBeUndefined();
  });

  it('accepts USDC explicitly', () => {
    expect(resolveWithdrawAsset('USDC')).toBe('USDC');
  });

  it('accepts USDsui explicitly', () => {
    expect(resolveWithdrawAsset('USDsui')).toBe('USDsui');
  });

  it('is case-insensitive', () => {
    expect(resolveWithdrawAsset('usdc')).toBe('USDC');
    expect(resolveWithdrawAsset('usdsui')).toBe('USDsui');
    expect(resolveWithdrawAsset('USDSUI')).toBe('USDsui');
  });

  it('throws for unsupported assets', () => {
    expect(() => resolveWithdrawAsset('USDT')).toThrow(/USDC, USDsui/);
    expect(() => resolveWithdrawAsset('SUI')).toThrow(/USDC, USDsui/);
    expect(() => resolveWithdrawAsset('ETH')).toThrow(/USDC, USDsui/);
  });

  it('WITHDRAW_ASSETS contains exactly USDC + USDsui', () => {
    expect(WITHDRAW_ASSETS).toEqual(['USDC', 'USDsui']);
  });
});
