import { describe, it, expect, beforeEach } from 'vitest';
import { explorerUrl, setJsonMode, isJsonMode, formatApyPercent } from './output.js';

describe('explorerUrl', () => {
  it('builds mainnet URL by default', () => {
    const url = explorerUrl('0xabc123');
    expect(url).toBe('https://suiscan.xyz/mainnet/tx/0xabc123');
  });

  it('builds testnet URL when specified', () => {
    const url = explorerUrl('0xabc123', 'testnet');
    expect(url).toBe('https://suiscan.xyz/testnet/tx/0xabc123');
  });

  it('builds mainnet URL when explicitly specified', () => {
    const url = explorerUrl('0xdef456', 'mainnet');
    expect(url).toBe('https://suiscan.xyz/mainnet/tx/0xdef456');
  });
});

describe('formatApyPercent', () => {
  // Regression for S.318 — SDK returns APY in DECIMAL form
  // (e.g. 0.0473 = 4.73%). Pre-S.318 every CLI display did
  // `apy.toFixed(2)` directly which produced "0.05%" instead of "4.73%".
  // formatApyPercent multiplies by 100 in ONE place so every display site
  // gets the conversion right by construction.

  it('converts NAVI USDC supply apy (0.0473) to "4.73%"', () => {
    expect(formatApyPercent(0.0473)).toBe('4.73%');
  });

  it('converts NAVI USDC borrow apy (0.0489) to "4.89%"', () => {
    expect(formatApyPercent(0.0489)).toBe('4.89%');
  });

  it('converts the realistic decimal-form value from agent.rates()', () => {
    // This is the actual value `agent.rates()` returned on 2026-05-25
    // during the smoke that surfaced the bug.
    expect(formatApyPercent(0.047259999999999996)).toBe('4.73%');
  });

  it('handles 0 (no-yield case)', () => {
    expect(formatApyPercent(0)).toBe('0.00%');
  });

  it('handles 1.0 (100% APY edge case)', () => {
    expect(formatApyPercent(1.0)).toBe('100.00%');
  });

  it('supports custom digit precision', () => {
    expect(formatApyPercent(0.0473, 1)).toBe('4.7%');
    expect(formatApyPercent(0.0473, 4)).toBe('4.7300%');
  });

  it('never accidentally renders percent-as-decimal (the S.318 regression we caught)', () => {
    // If someone reintroduces the bug, the input to formatApyPercent
    // would be 4.73 (already percent form) and would render as "473.00%"
    // — which would be obvious in any smoke run. This test pins the
    // contract: input MUST be decimal form.
    expect(formatApyPercent(4.73)).toBe('473.00%');
  });
});

describe('jsonMode', () => {
  beforeEach(() => {
    setJsonMode(false);
  });

  it('defaults to false', () => {
    expect(isJsonMode()).toBe(false);
  });

  it('can be enabled', () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
  });

  it('can be toggled back', () => {
    setJsonMode(true);
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });
});
