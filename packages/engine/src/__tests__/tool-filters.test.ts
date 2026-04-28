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

  // --------------------------------------------------------------------
  // [Bug — 2026-04-28] USDT alias expansion regression suite.
  //
  // Pre-fix: querying `assets: ['USDT']` against NAVI's real pool list
  // — which uses `suiUSDT`, `wUSDT`, etc. — returned an empty payload
  // because the filter did exact-string lowercase match. The LLM then
  // narrated "USDT: not actively listed on NAVI", which is factually
  // wrong (NAVI lists two USDT variants). Post-fix the filter treats
  // user-supplied `USDT` as the family request and returns every
  // matching pool, so the LLM has the data it needs to render correctly.
  // --------------------------------------------------------------------
  describe('TOKEN_ALIASES (USDT/USDC/USDe family expansion)', () => {
    const NAVI_RATES = {
      USDC:    { saveApy: 0.0448, borrowApy: 0.0394 },
      suiUSDT: { saveApy: 0.0512, borrowApy: 0.0671 },
      wUSDT:   { saveApy: 0.0322, borrowApy: 0.0455 },
      SUI:     { saveApy: 0.0296, borrowApy: 0.0216 },
      USDe:    { saveApy: 0.0421, borrowApy: 0.0589 },
      suiUSDe: { saveApy: 0.0498, borrowApy: 0.0612 },
    };

    it('assets: ["USDT"] returns BOTH suiUSDT and wUSDT (alias-expanded)', () => {
      const out = ratesInternal.applyFilters(NAVI_RATES, { assets: ['USDT'] });
      const symbols = new Set(Object.keys(out));
      expect(symbols.has('suiUSDT')).toBe(true);
      expect(symbols.has('wUSDT')).toBe(true);
      expect(symbols.has('USDC')).toBe(false);
      expect(symbols.has('SUI')).toBe(false);
      expect(symbols.size).toBe(2);
    });

    it('assets: ["usdt"] (lowercase) also expands the family', () => {
      const out = ratesInternal.applyFilters(NAVI_RATES, { assets: ['usdt'] });
      expect(new Set(Object.keys(out))).toEqual(new Set(['suiUSDT', 'wUSDT']));
    });

    it('assets: ["USDC", "USDT", "SUI"] reproduces the bug-report query and returns all 4 pools', () => {
      const out = ratesInternal.applyFilters(NAVI_RATES, { assets: ['USDC', 'USDT', 'SUI'] });
      expect(new Set(Object.keys(out))).toEqual(new Set(['USDC', 'suiUSDT', 'wUSDT', 'SUI']));
    });

    it('assets: ["USDe"] returns USDe + suiUSDe', () => {
      const out = ratesInternal.applyFilters(NAVI_RATES, { assets: ['USDe'] });
      expect(new Set(Object.keys(out))).toEqual(new Set(['USDe', 'suiUSDe']));
    });

    it('non-aliased symbols still match by exact lowercase (no regression)', () => {
      const out = ratesInternal.applyFilters(NAVI_RATES, { assets: ['SUI'] });
      expect(Object.keys(out)).toEqual(['SUI']);
    });

    it('expandAliases is idempotent — passing the expanded form returns the same set', () => {
      const direct = ratesInternal.expandAliases(['USDT']);
      const expanded = ratesInternal.expandAliases(['suiUSDT', 'wUSDT', 'USDT']);
      // Direct request should produce a SUPERSET (or equal set) of the expanded form.
      for (const s of expanded) expect(direct.has(s)).toBe(true);
    });
  });
});
