import { describe, it, expect } from 'vitest';
import {
  mistToSui,
  suiToMist,
  usdcToRaw,
  rawToUsdc,
  stableToRaw,
  rawToStable,
  getDecimals,
  rawToDisplay,
  displayToRaw,
  bpsToPercent,
  formatUsd,
  formatSui,
  formatLargeNumber,
  normalizeAsset,
} from './format.js';

describe('format utilities', () => {
  describe('mistToSui', () => {
    it('converts 1 billion MIST to 1 SUI', () => {
      expect(mistToSui(1_000_000_000n)).toBe(1);
    });

    it('converts 0 MIST to 0 SUI', () => {
      expect(mistToSui(0n)).toBe(0);
    });

    it('converts fractional amounts', () => {
      expect(mistToSui(500_000_000n)).toBe(0.5);
    });

    it('handles small dust amounts', () => {
      expect(mistToSui(1000n)).toBeCloseTo(0.000001, 6);
    });
  });

  describe('suiToMist', () => {
    it('converts 1 SUI to 1 billion MIST', () => {
      expect(suiToMist(1)).toBe(1_000_000_000n);
    });

    it('converts 0 SUI to 0 MIST', () => {
      expect(suiToMist(0)).toBe(0n);
    });

    it('rounds fractional MIST', () => {
      expect(suiToMist(0.5)).toBe(500_000_000n);
    });
  });

  describe('usdcToRaw', () => {
    it('converts 1 USDC to 1_000_000 raw', () => {
      expect(usdcToRaw(1)).toBe(1_000_000n);
    });

    it('converts 0.01 USDC (1 cent)', () => {
      expect(usdcToRaw(0.01)).toBe(10_000n);
    });

    it('converts 0 USDC', () => {
      expect(usdcToRaw(0)).toBe(0n);
    });

    it('handles large amounts', () => {
      expect(usdcToRaw(1000)).toBe(1_000_000_000n);
    });
  });

  describe('rawToUsdc', () => {
    it('converts 1_000_000 raw to 1 USDC', () => {
      expect(rawToUsdc(1_000_000n)).toBe(1);
    });

    it('converts 10_000 raw to 0.01 USDC', () => {
      expect(rawToUsdc(10_000n)).toBe(0.01);
    });

    it('converts 0 raw to 0', () => {
      expect(rawToUsdc(0n)).toBe(0);
    });
  });

  describe('rawToDisplay / displayToRaw', () => {
    it('round-trips USDC (6 decimals)', () => {
      const raw = 5_500_000n;
      const display = rawToDisplay(raw, 6);
      expect(display).toBe(5.5);
      expect(displayToRaw(display, 6)).toBe(raw);
    });

    it('round-trips SUI (9 decimals)', () => {
      const raw = 2_500_000_000n;
      const display = rawToDisplay(raw, 9);
      expect(display).toBe(2.5);
      expect(displayToRaw(display, 9)).toBe(raw);
    });
  });

  describe('bpsToPercent', () => {
    it('converts 100 bps to 1%', () => {
      expect(bpsToPercent(100n)).toBe(1);
    });

    it('converts 10 bps to 0.1%', () => {
      expect(bpsToPercent(10n)).toBe(0.1);
    });

    it('converts 10000 bps to 100%', () => {
      expect(bpsToPercent(10_000n)).toBe(100);
    });

    it('converts 0 bps to 0%', () => {
      expect(bpsToPercent(0n)).toBe(0);
    });

    it('converts 5 bps to 0.05%', () => {
      expect(bpsToPercent(5n)).toBe(0.05);
    });
  });

  describe('formatUsd', () => {
    it('formats whole dollars', () => {
      expect(formatUsd(100)).toBe('$100.00');
    });

    it('formats cents', () => {
      expect(formatUsd(0.01)).toBe('$0.01');
    });

    it('formats zero', () => {
      expect(formatUsd(0)).toBe('$0.00');
    });

    it('truncates to 2 decimal places', () => {
      expect(formatUsd(1.999)).toBe('$2.00');
    });
  });

  describe('formatSui', () => {
    it('formats normal amounts with 3 decimals', () => {
      expect(formatSui(1.234)).toBe('1.234 SUI');
    });

    it('formats tiny amounts with 6 decimals', () => {
      expect(formatSui(0.000123)).toBe('0.000123 SUI');
    });

    it('uses 3 decimals at the boundary (0.001)', () => {
      expect(formatSui(0.001)).toBe('0.001 SUI');
    });
  });

  describe('formatLargeNumber', () => {
    it('formats millions', () => {
      expect(formatLargeNumber(1_500_000)).toBe('1.5M');
    });

    it('formats thousands', () => {
      expect(formatLargeNumber(42_300)).toBe('42.3K');
    });

    it('formats small numbers with 2 decimals', () => {
      expect(formatLargeNumber(99.5)).toBe('99.50');
    });

    it('formats exactly 1M', () => {
      expect(formatLargeNumber(1_000_000)).toBe('1.0M');
    });

    it('formats exactly 1K', () => {
      expect(formatLargeNumber(1_000)).toBe('1.0K');
    });
  });

  describe('stableToRaw', () => {
    it('converts 100 USDC (6 decimals) to raw', () => {
      expect(stableToRaw(100, 6)).toBe(100_000_000n);
    });

    it('converts 50.5 USDT (6 decimals) to raw', () => {
      expect(stableToRaw(50.5, 6)).toBe(50_500_000n);
    });
  });

  describe('rawToStable', () => {
    it('converts raw to 100 USDC', () => {
      expect(rawToStable(100_000_000n, 6)).toBe(100);
    });
  });

  describe('getDecimals', () => {
    it('returns 6 for USDC', () => {
      expect(getDecimals('USDC')).toBe(6);
    });

    it('returns 6 for USDT', () => {
      expect(getDecimals('USDT')).toBe(6);
    });

    it('returns 6 for USDe', () => {
      expect(getDecimals('USDe')).toBe(6);
    });

    it('returns 6 for USDsui', () => {
      expect(getDecimals('USDsui')).toBe(6);
    });

    it('returns 9 for SUI', () => {
      expect(getDecimals('SUI')).toBe(9);
    });
  });

  describe('normalizeAsset', () => {
    it('returns canonical casing for USDC', () => {
      expect(normalizeAsset('usdc')).toBe('USDC');
      expect(normalizeAsset('USDC')).toBe('USDC');
      expect(normalizeAsset('Usdc')).toBe('USDC');
    });

    it('returns canonical casing for USDe', () => {
      expect(normalizeAsset('usde')).toBe('USDe');
      expect(normalizeAsset('USDE')).toBe('USDe');
      expect(normalizeAsset('USDe')).toBe('USDe');
    });

    it('returns canonical casing for USDsui', () => {
      expect(normalizeAsset('usdsui')).toBe('USDsui');
      expect(normalizeAsset('USDSUI')).toBe('USDsui');
      expect(normalizeAsset('USDsui')).toBe('USDsui');
    });

    it('returns canonical casing for USDT', () => {
      expect(normalizeAsset('usdt')).toBe('USDT');
      expect(normalizeAsset('USDT')).toBe('USDT');
    });

    it('returns canonical casing for SUI', () => {
      expect(normalizeAsset('sui')).toBe('SUI');
      expect(normalizeAsset('SUI')).toBe('SUI');
    });

    it('passes through unknown assets for downstream rejection', () => {
      expect(normalizeAsset('DOGE')).toBe('DOGE');
      expect(normalizeAsset('unknown')).toBe('unknown');
    });
  });
});
