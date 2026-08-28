import { describe, expect, it } from 'vitest';
import { usdcStringToMicro, usdcToMicro } from './usdc-amount.js';

// S.1226 (Aegis §3) — pin the exact micro values the old
// Math.floor(usdc * 1e6) path got wrong: 0.29 * 1e6 = 289999.999… floored
// to 289999. A wave's per-slot escrow must be micro-exact.

describe('usdcToMicro — integer-safe, never float-floor dust', () => {
  it('pins the audit fixtures exactly', () => {
    expect(usdcToMicro(0.1)).toBe(100_000n);
    expect(usdcToMicro(0.29)).toBe(290_000n); // the floor bug: 289_999
    expect(usdcToMicro(0.05)).toBe(50_000n);
    expect(usdcToMicro(25)).toBe(25_000_000n);
    expect(usdcToMicro(0.01)).toBe(10_000n);
    expect(usdcToMicro(100)).toBe(100_000_000n);
    expect(usdcToMicro(0)).toBe(0n);
  });

  it('a wave total multiplies in bigint without dust', () => {
    expect(usdcToMicro(0.1) * 150n).toBe(15_000_000n); // $15.00 exactly
    expect(usdcToMicro(0.29) * 100n).toBe(29_000_000n);
  });

  it('rejects junk', () => {
    expect(() => usdcToMicro(Number.NaN)).toThrow(/USDC/);
    expect(() => usdcToMicro(-1)).toThrow(/USDC/);
    expect(() => usdcToMicro(Number.POSITIVE_INFINITY)).toThrow(/USDC/);
  });
});

describe('usdcStringToMicro — the API-boundary string path', () => {
  it('parses decimal strings exactly', () => {
    expect(usdcStringToMicro('0.10')).toBe(100_000n);
    expect(usdcStringToMicro('0.29')).toBe(290_000n);
    expect(usdcStringToMicro('25')).toBe(25_000_000n);
    expect(usdcStringToMicro(' 5.5 ')).toBe(5_500_000n);
    expect(usdcStringToMicro('0.000001')).toBe(1n);
  });

  it('rejects junk and sub-micro precision', () => {
    expect(() => usdcStringToMicro('abc')).toThrow(/USDC/);
    expect(() => usdcStringToMicro('1.2345678')).toThrow(/USDC/);
    expect(() => usdcStringToMicro('-1')).toThrow(/USDC/);
    expect(() => usdcStringToMicro('1e6')).toThrow(/USDC/);
  });
});
