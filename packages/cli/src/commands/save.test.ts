// [SPEC_AGENTIC_STACK P1 / CLI F6 — 2026-05-25]
// Parser unit tests for `t2000 save --asset`. Follows the pattern established by
// send.test.ts: extract the pure parser, test it without spinning up a wallet.
import { describe, it, expect } from 'vitest';
import { resolveSaveAsset, SAVE_ASSETS } from './save.js';

describe('resolveSaveAsset', () => {
  it('defaults to USDC when --asset is omitted', () => {
    expect(resolveSaveAsset(undefined)).toBe('USDC');
  });

  it('accepts USDC explicitly', () => {
    expect(resolveSaveAsset('USDC')).toBe('USDC');
  });

  it('accepts USDsui (strategic exception)', () => {
    expect(resolveSaveAsset('USDsui')).toBe('USDsui');
  });

  it('is case-insensitive for usdsui', () => {
    expect(resolveSaveAsset('usdsui')).toBe('USDsui');
    expect(resolveSaveAsset('USDSUI')).toBe('USDsui');
  });

  it('throws for unsupported assets (USDT, SUI, etc.)', () => {
    expect(() => resolveSaveAsset('USDT')).toThrow(/USDC, USDsui/);
    expect(() => resolveSaveAsset('SUI')).toThrow(/USDC, USDsui/);
    expect(() => resolveSaveAsset('ETH')).toThrow(/USDC, USDsui/);
  });

  it('SAVE_ASSETS contains exactly USDC + USDsui', () => {
    expect(SAVE_ASSETS).toEqual(['USDC', 'USDsui']);
  });
});
