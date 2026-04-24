import { describe, it, expect } from 'vitest';
import { _internal as ratesInternal } from '../tools/rates.js';

const SAMPLE_RATES = {
  USDC: { saveApy: 0.0396, borrowApy: 0.0357 },
  USDT: { saveApy: 0.0339, borrowApy: 0.703 },
  USDSUI: { saveApy: 0.069, borrowApy: 0.0354 },
  SUI: { saveApy: 0.0271, borrowApy: 0.0184 },
  WAL: { saveApy: 0.1694, borrowApy: 0.1351 },
  NS: { saveApy: 0.1888, borrowApy: 0.1101 },
  LOFI: { saveApy: 0.0123, borrowApy: 0.05 },
  XAUm: { saveApy: 0.0507, borrowApy: 0.0803 },
};

describe('rates_info — applyFilters (v0.46.6)', () => {
  it('default behavior: top 8 sorted desc by saveApy', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, { topN: 8 });
    const symbols = Object.keys(out);
    expect(symbols.length).toBe(8);
    expect(symbols[0]).toBe('NS');
    expect(symbols[1]).toBe('WAL');
  });

  it('topN: 50 returns all entries', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, { topN: 50 });
    expect(Object.keys(out).length).toBe(Object.keys(SAMPLE_RATES).length);
  });

  it('assets: ["USDC"] returns only USDC', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, { assets: ['USDC'] });
    expect(Object.keys(out)).toEqual(['USDC']);
    expect(out.USDC.saveApy).toBeCloseTo(0.0396);
  });

  it('assets is case-insensitive', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, { assets: ['usdc', 'sui'] });
    expect(new Set(Object.keys(out))).toEqual(new Set(['USDC', 'SUI']));
  });

  it('stableOnly: returns only USD-pegged assets', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, { stableOnly: true });
    const symbols = new Set(Object.keys(out));
    expect(symbols.has('USDC')).toBe(true);
    expect(symbols.has('USDT')).toBe(true);
    expect(symbols.has('USDSUI')).toBe(true);
    expect(symbols.has('WAL')).toBe(false);
    expect(symbols.has('SUI')).toBe(false);
    expect(symbols.has('XAUm')).toBe(false); // gold-pegged, not USD
    expect(symbols.has('LOFI')).toBe(false);
  });

  it('assets takes precedence over stableOnly', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, {
      assets: ['WAL'],
      stableOnly: true,
    });
    expect(Object.keys(out)).toEqual(['WAL']);
  });

  it('topN clips after filtering, not before', () => {
    const out = ratesInternal.applyFilters(SAMPLE_RATES, {
      stableOnly: true,
      topN: 2,
    });
    expect(Object.keys(out).length).toBe(2);
    // Top stables by APY: USDSUI (6.9%), USDC (3.96%)
    expect(Object.keys(out)[0]).toBe('USDSUI');
    expect(Object.keys(out)[1]).toBe('USDC');
  });

  it('isStable matches lowercase variants', () => {
    expect(ratesInternal.isStable('USDC')).toBe(true);
    expect(ratesInternal.isStable('usdc')).toBe(true);
    expect(ratesInternal.isStable('UsDsUi')).toBe(true);
    expect(ratesInternal.isStable('SUI')).toBe(false);
    expect(ratesInternal.isStable('XAUm')).toBe(false);
  });
});
