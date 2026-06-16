import { describe, it, expect, vi } from 'vitest';
import {
  COIN_REGISTRY,
  TOKEN_MAP,
  getDecimalsForCoinType,
  resolveCoinDecimals,
  resolveSymbol,
  resolveTokenType,
  SUI_TYPE,
  USDC_TYPE,
  USDSUI_TYPE,
  USDE_TYPE,
  ETH_TYPE,
  WBTC_TYPE,
  IKA_TYPE,
  LOFI_TYPE,
  MANIFEST_TYPE,
} from './token-registry.js';

describe('resolveCoinDecimals (2.11 — any-token swap)', () => {
  const UNKNOWN = '0xabc123::wtf::WTF';
  const mkClient = (impl: () => Promise<unknown>) => ({ core: { getCoinMetadata: vi.fn(impl) } });

  it('uses registry decimals WITHOUT an on-chain call for a known token', async () => {
    const client = mkClient(async () => ({ metadata: { decimals: 99 } }));
    expect(await resolveCoinDecimals(client, USDC_TYPE)).toBe(6);
    expect(client.core.getCoinMetadata).not.toHaveBeenCalled();
  });

  it('fetches decimals on-chain for an unknown coin type (nested shape)', async () => {
    const client = mkClient(async () => ({ metadata: { decimals: 8 } }));
    expect(await resolveCoinDecimals(client, UNKNOWN)).toBe(8);
    expect(client.core.getCoinMetadata).toHaveBeenCalledWith({ coinType: UNKNOWN });
  });

  it('handles a flat { decimals } response shape', async () => {
    const client = mkClient(async () => ({ decimals: 2 }));
    expect(await resolveCoinDecimals(client, UNKNOWN)).toBe(2);
  });

  it('falls back to the registry heuristic when the on-chain read throws', async () => {
    const client = mkClient(async () => {
      throw new Error('rpc down');
    });
    // Unknown type with no suffix match → the 9-decimal default.
    expect(await resolveCoinDecimals(client, UNKNOWN)).toBe(9);
  });

  it('falls back when metadata has no usable decimals', async () => {
    const client = mkClient(async () => ({ metadata: {} }));
    expect(await resolveCoinDecimals(client, UNKNOWN)).toBe(9);
  });
});

describe('COIN_REGISTRY', () => {
  it('contains the settlement stable + common swap assets', () => {
    expect(COIN_REGISTRY.USDC).toBeDefined();
    for (const key of ['SUI', 'wBTC', 'ETH', 'GOLD', 'DEEP', 'WAL', 'NS', 'IKA', 'CETUS', 'NAVX', 'vSUI', 'haSUI', 'afSUI', 'LOFI', 'MANIFEST']) {
      expect(COIN_REGISTRY[key], `missing ${key}`).toBeDefined();
    }
  });

  it('contains the other known stables', () => {
    expect(COIN_REGISTRY.USDT).toBeDefined();
    expect(COIN_REGISTRY.USDe).toBeDefined();
    expect(COIN_REGISTRY.USDSUI).toBeDefined();
  });

  it('does not contain removed tokens', () => {
    expect(COIN_REGISTRY.FDUSD).toBeUndefined();
    expect(COIN_REGISTRY.AUSD).toBeUndefined();
    expect(COIN_REGISTRY.BUCK).toBeUndefined();
    expect(COIN_REGISTRY.BLUB).toBeUndefined();
    expect(COIN_REGISTRY.SCA).toBeUndefined();
    expect(COIN_REGISTRY.TURBOS).toBeUndefined();
  });

  it('has correct decimals for stablecoins (6)', () => {
    expect(COIN_REGISTRY.USDC.decimals).toBe(6);
    expect(COIN_REGISTRY.USDT.decimals).toBe(6);
    expect(COIN_REGISTRY.USDe.decimals).toBe(6);
    expect(COIN_REGISTRY.USDSUI.decimals).toBe(6);
    expect(COIN_REGISTRY.DEEP.decimals).toBe(6);
    expect(COIN_REGISTRY.NS.decimals).toBe(6);
    expect(COIN_REGISTRY.GOLD.decimals).toBe(9);
  });

  it('has correct decimals for SUI-based tokens (9)', () => {
    expect(COIN_REGISTRY.SUI.decimals).toBe(9);
    expect(COIN_REGISTRY.IKA.decimals).toBe(9);
    expect(COIN_REGISTRY.LOFI.decimals).toBe(9);
    expect(COIN_REGISTRY.MANIFEST.decimals).toBe(9);
    expect(COIN_REGISTRY.CETUS.decimals).toBe(9);
    expect(COIN_REGISTRY.NAVX.decimals).toBe(9);
    expect(COIN_REGISTRY.vSUI.decimals).toBe(9);
    expect(COIN_REGISTRY.haSUI.decimals).toBe(9);
    expect(COIN_REGISTRY.afSUI.decimals).toBe(9);
    expect(COIN_REGISTRY.WAL.decimals).toBe(9);
  });

  it('has correct decimals for ETH/wBTC (8)', () => {
    expect(COIN_REGISTRY.ETH.decimals).toBe(8);
    expect(COIN_REGISTRY.wBTC.decimals).toBe(8);
  });

  it('GOLD/XAUM has 9 decimals (on-chain CoinMetadata)', () => {
    expect(COIN_REGISTRY.GOLD.decimals).toBe(9);
    expect(COIN_REGISTRY.GOLD.type).toContain('xaum::XAUM');
  });

  it('has exactly 19 entries', () => {
    expect(Object.keys(COIN_REGISTRY).length).toBe(19);
  });
});

describe('getDecimalsForCoinType', () => {
  it('returns exact match decimals', () => {
    expect(getDecimalsForCoinType('0x2::sui::SUI')).toBe(9);
    expect(getDecimalsForCoinType(USDC_TYPE)).toBe(6);
    expect(getDecimalsForCoinType(USDSUI_TYPE)).toBe(6);
    expect(getDecimalsForCoinType(ETH_TYPE)).toBe(8);
    expect(getDecimalsForCoinType(IKA_TYPE)).toBe(9);
  });

  it('returns correct decimals for legacy tokens', () => {
    expect(getDecimalsForCoinType(USDSUI_TYPE)).toBe(6);
    expect(getDecimalsForCoinType(USDE_TYPE)).toBe(6);
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
    expect(resolveSymbol(IKA_TYPE)).toBe('IKA');
    expect(resolveSymbol(LOFI_TYPE)).toBe('LOFI');
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
    expect(resolveTokenType('IKA')).toBe(IKA_TYPE);
    expect(resolveTokenType('LOFI')).toBe(LOFI_TYPE);
  });

  it('is case-insensitive', () => {
    expect(resolveTokenType('usdc')).toBe(USDC_TYPE);
    expect(resolveTokenType('usdsui')).toBe(USDSUI_TYPE);
    expect(resolveTokenType('USDe')).toBe(USDE_TYPE);
    expect(resolveTokenType('USDE')).toBe(USDE_TYPE);
    expect(resolveTokenType('Sui')).toBe('0x2::sui::SUI');
    expect(resolveTokenType('ika')).toBe(IKA_TYPE);
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
    expect(TOKEN_MAP['IKA']).toBe(IKA_TYPE);
    expect(TOKEN_MAP['LOFI']).toBe(LOFI_TYPE);
  });
});

describe('Type constants', () => {
  it('SUI_TYPE matches registry', () => {
    expect(SUI_TYPE).toBe(COIN_REGISTRY.SUI.type);
  });

  it('USDC_TYPE matches registry', () => {
    expect(USDC_TYPE).toBe(COIN_REGISTRY.USDC.type);
  });

  it('USDSUI_TYPE matches registry (legacy)', () => {
    expect(USDSUI_TYPE).toBe(COIN_REGISTRY.USDSUI.type);
  });

  it('new type constants match registry', () => {
    expect(IKA_TYPE).toBe(COIN_REGISTRY.IKA.type);
    expect(LOFI_TYPE).toBe(COIN_REGISTRY.LOFI.type);
    expect(MANIFEST_TYPE).toBe(COIN_REGISTRY.MANIFEST.type);
  });
});
