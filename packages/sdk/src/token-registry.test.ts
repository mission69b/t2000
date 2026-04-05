import { describe, it, expect } from 'vitest';
import {
  COIN_REGISTRY,
  TOKEN_MAP,
  getDecimalsForCoinType,
  resolveSymbol,
  resolveTokenType,
  SUI_TYPE,
  USDC_TYPE,
  USDSUI_TYPE,
  USDE_TYPE,
  ETH_TYPE,
  WBTC_TYPE,
} from './token-registry.js';

describe('COIN_REGISTRY', () => {
  it('contains all expected core tokens', () => {
    expect(COIN_REGISTRY.SUI).toBeDefined();
    expect(COIN_REGISTRY.USDC).toBeDefined();
    expect(COIN_REGISTRY.USDSUI).toBeDefined();
    expect(COIN_REGISTRY.USDe).toBeDefined();
    expect(COIN_REGISTRY.ETH).toBeDefined();
    expect(COIN_REGISTRY.wBTC).toBeDefined();
    expect(COIN_REGISTRY.MANIFEST).toBeDefined();
  });

  it('has correct decimals for stablecoins (6)', () => {
    expect(COIN_REGISTRY.USDC.decimals).toBe(6);
    expect(COIN_REGISTRY.USDT.decimals).toBe(6);
    expect(COIN_REGISTRY.USDe.decimals).toBe(6);
    expect(COIN_REGISTRY.USDSUI.decimals).toBe(6);
    expect(COIN_REGISTRY.DEEP.decimals).toBe(6);
    expect(COIN_REGISTRY.NS.decimals).toBe(6);
  });

  it('has correct decimals for SUI (9)', () => {
    expect(COIN_REGISTRY.SUI.decimals).toBe(9);
  });

  it('has correct decimals for ETH/wBTC (8)', () => {
    expect(COIN_REGISTRY.ETH.decimals).toBe(8);
    expect(COIN_REGISTRY.wBTC.decimals).toBe(8);
  });

  it('GOLD/XAUM has 6 decimals (not 9)', () => {
    expect(COIN_REGISTRY.GOLD.decimals).toBe(6);
    expect(COIN_REGISTRY.GOLD.type).toContain('xaum::XAUM');
  });
});

describe('getDecimalsForCoinType', () => {
  it('returns exact match decimals', () => {
    expect(getDecimalsForCoinType('0x2::sui::SUI')).toBe(9);
    expect(getDecimalsForCoinType(USDC_TYPE)).toBe(6);
    expect(getDecimalsForCoinType(USDSUI_TYPE)).toBe(6);
    expect(getDecimalsForCoinType(ETH_TYPE)).toBe(8);
  });

  it('returns suffix-matched decimals for address variations', () => {
    expect(getDecimalsForCoinType('0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI')).toBe(9);
  });

  it('defaults to 9 for unknown coin types', () => {
    expect(getDecimalsForCoinType('0xabc123::mystery::TOKEN')).toBe(9);
  });

  it('handles USDe (SUI_USDE) correctly via suffix', () => {
    expect(getDecimalsForCoinType(USDE_TYPE)).toBe(6);
  });
});

describe('resolveSymbol', () => {
  it('resolves known coin types to friendly symbols', () => {
    expect(resolveSymbol(SUI_TYPE)).toBe('SUI');
    expect(resolveSymbol(USDC_TYPE)).toBe('USDC');
    expect(resolveSymbol(USDSUI_TYPE)).toBe('USDsui');
    expect(resolveSymbol(USDE_TYPE)).toBe('USDe');
    expect(resolveSymbol(ETH_TYPE)).toBe('ETH');
    expect(resolveSymbol(WBTC_TYPE)).toBe('wBTC');
  });

  it('falls back to last segment for unknown types', () => {
    expect(resolveSymbol('0xabc::mystery::COOL')).toBe('COOL');
  });

  it('handles GOLD/XAUM correctly', () => {
    expect(resolveSymbol(COIN_REGISTRY.GOLD.type)).toBe('GOLD');
  });
});

describe('resolveTokenType', () => {
  it('resolves friendly names to full coin types', () => {
    expect(resolveTokenType('SUI')).toBe('0x2::sui::SUI');
    expect(resolveTokenType('USDC')).toBe(USDC_TYPE);
    expect(resolveTokenType('USDSUI')).toBe(USDSUI_TYPE);
  });

  it('is case-insensitive', () => {
    expect(resolveTokenType('usdc')).toBe(USDC_TYPE);
    expect(resolveTokenType('usdsui')).toBe(USDSUI_TYPE);
    expect(resolveTokenType('USDe')).toBe(USDE_TYPE);
    expect(resolveTokenType('USDE')).toBe(USDE_TYPE);
    expect(resolveTokenType('Sui')).toBe('0x2::sui::SUI');
  });

  it('returns input unchanged for full coin types', () => {
    const fullType = '0xabc::mod::TOKEN';
    expect(resolveTokenType(fullType)).toBe(fullType);
  });

  it('returns null for unknown names', () => {
    expect(resolveTokenType('NONEXISTENT')).toBeNull();
  });
});

describe('TOKEN_MAP', () => {
  it('contains both original-case and uppercase keys', () => {
    expect(TOKEN_MAP['USDe']).toBe(USDE_TYPE);
    expect(TOKEN_MAP['USDE']).toBe(USDE_TYPE);
    expect(TOKEN_MAP['wBTC']).toBe(WBTC_TYPE);
    expect(TOKEN_MAP['WBTC']).toBe(WBTC_TYPE);
    expect(TOKEN_MAP['vSUI']).toBeDefined();
    expect(TOKEN_MAP['VSUI']).toBeDefined();
  });
});

describe('Type constants', () => {
  it('SUI_TYPE matches registry', () => {
    expect(SUI_TYPE).toBe(COIN_REGISTRY.SUI.type);
  });

  it('USDC_TYPE matches registry', () => {
    expect(USDC_TYPE).toBe(COIN_REGISTRY.USDC.type);
  });

  it('USDSUI_TYPE matches registry', () => {
    expect(USDSUI_TYPE).toBe(COIN_REGISTRY.USDSUI.type);
  });
});
