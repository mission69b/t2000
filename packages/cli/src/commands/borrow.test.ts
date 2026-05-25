// [SPEC_AGENTIC_STACK P1 / CLI F6 — 2026-05-25]
// Parser unit tests for `t2000 borrow --asset`. The borrow command always
// resolves to a concrete asset (defaults to USDC) — unlike `repay` which can
// stay undefined to mean "highest-APY borrow".
import { describe, it, expect } from 'vitest';
import { resolveBorrowAsset, BORROW_ASSETS } from './borrow.js';

describe('resolveBorrowAsset', () => {
  it('defaults to USDC when --asset is omitted', () => {
    expect(resolveBorrowAsset(undefined)).toBe('USDC');
  });

  it('accepts USDC explicitly', () => {
    expect(resolveBorrowAsset('USDC')).toBe('USDC');
  });

  it('accepts USDsui (strategic exception)', () => {
    expect(resolveBorrowAsset('USDsui')).toBe('USDsui');
  });

  it('is case-insensitive', () => {
    expect(resolveBorrowAsset('usdc')).toBe('USDC');
    expect(resolveBorrowAsset('usdsui')).toBe('USDsui');
  });

  it('throws for unsupported assets', () => {
    expect(() => resolveBorrowAsset('USDT')).toThrow(/USDC, USDsui/);
    expect(() => resolveBorrowAsset('SUI')).toThrow(/USDC, USDsui/);
  });

  it('BORROW_ASSETS contains exactly USDC + USDsui', () => {
    expect(BORROW_ASSETS).toEqual(['USDC', 'USDsui']);
  });
});
