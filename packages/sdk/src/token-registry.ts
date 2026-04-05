/**
 * Unified token registry — single source of truth for coin types, decimals, and symbols.
 *
 * ZERO heavy dependencies. Safe to import from any context (server, browser, Edge).
 * All other token maps (KNOWN_COINS, DEC_MAP, TOKEN_DECIMALS, etc.) should be replaced
 * with imports from this file.
 *
 * To add a new token: add ONE entry to COIN_REGISTRY below. Everything else derives from it.
 */

export interface CoinMeta {
  type: string;
  decimals: number;
  symbol: string;
}

/**
 * Canonical coin registry. Merges NAVI lending assets + swap-supported tokens.
 * Key = user-friendly name (used in swap_execute, CLI, prompts).
 */
export const COIN_REGISTRY: Record<string, CoinMeta> = {
  SUI:      { type: '0x2::sui::SUI', decimals: 9, symbol: 'SUI' },
  USDC:     { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6, symbol: 'USDC' },
  USDT:     { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6, symbol: 'USDT' },
  USDe:     { type: '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE', decimals: 6, symbol: 'USDe' },
  USDSUI:   { type: '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI', decimals: 6, symbol: 'USDsui' },
  WAL:      { type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL', decimals: 9, symbol: 'WAL' },
  ETH:      { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8, symbol: 'ETH' },
  wBTC:     { type: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC', decimals: 8, symbol: 'wBTC' },
  NAVX:     { type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX', decimals: 9, symbol: 'NAVX' },
  CETUS:    { type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS', decimals: 9, symbol: 'CETUS' },
  DEEP:     { type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', decimals: 6, symbol: 'DEEP' },
  NS:       { type: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS', decimals: 6, symbol: 'NS' },
  GOLD:     { type: '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM', decimals: 6, symbol: 'GOLD' },
  MANIFEST: { type: '0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST', decimals: 9, symbol: 'MANIFEST' },
  vSUI:     { type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT', decimals: 9, symbol: 'vSUI' },
  haSUI:    { type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e136a8bc::hasui::HASUI', decimals: 9, symbol: 'haSUI' },
  afSUI:    { type: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI', decimals: 9, symbol: 'afSUI' },
  FDUSD:    { type: '0xf16e6b723f242ec745dfd7634ad072c42d5c1d9ac9d62a39c381303eaa57693a::fdusd::FDUSD', decimals: 6, symbol: 'FDUSD' },
  AUSD:     { type: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD', decimals: 6, symbol: 'AUSD' },
  BUCK:     { type: '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK', decimals: 9, symbol: 'BUCK' },
  BLUB:     { type: '0xfa7ac3951fdca12c1b6d18eb19e1aa2fbc31e4d45773c8e45b4ded3ef8d83f8a::blub::BLUB', decimals: 9, symbol: 'BLUB' },
  SCA:      { type: '0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA', decimals: 9, symbol: 'SCA' },
  TURBOS:   { type: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS', decimals: 9, symbol: 'TURBOS' },
};

/** Reverse lookup: coin type → CoinMeta. Built once at import time. */
const BY_TYPE = new Map<string, CoinMeta>();
for (const meta of Object.values(COIN_REGISTRY)) {
  BY_TYPE.set(meta.type, meta);
}

/**
 * Get decimals for any coin type. Checks full type match, then suffix match, then defaults to 9.
 * Handles address normalization differences (leading zeros, casing).
 */
export function getDecimalsForCoinType(coinType: string): number {
  const direct = BY_TYPE.get(coinType);
  if (direct) return direct.decimals;

  const suffix = coinType.split('::').slice(1).join('::').toUpperCase();
  if (suffix) {
    for (const meta of BY_TYPE.values()) {
      const metaSuffix = meta.type.split('::').slice(1).join('::').toUpperCase();
      if (metaSuffix === suffix) return meta.decimals;
    }
  }

  return 9;
}

/**
 * Resolve a full coin type to a user-friendly symbol.
 * Returns the last `::` segment if not in the registry.
 */
export function resolveSymbol(coinType: string): string {
  const direct = BY_TYPE.get(coinType);
  if (direct) return direct.symbol;

  const suffix = coinType.split('::').slice(1).join('::').toUpperCase();
  if (suffix) {
    for (const meta of BY_TYPE.values()) {
      const metaSuffix = meta.type.split('::').slice(1).join('::').toUpperCase();
      if (metaSuffix === suffix) return meta.symbol;
    }
  }

  return coinType.split('::').pop() ?? coinType;
}

/**
 * Name → type map for swap resolution. Derived from COIN_REGISTRY.
 * Contains BOTH original-case and UPPERCASE keys for case-insensitive lookup.
 * Backward-compatible with the original TOKEN_MAP in cetus-swap.ts.
 */
export const TOKEN_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [name, meta] of Object.entries(COIN_REGISTRY)) {
    map[name] = meta.type;
    map[name.toUpperCase()] = meta.type;
  }
  return map;
})();

/**
 * Resolve a user-friendly token name to its full coin type.
 * Returns the input unchanged if already a full coin type (contains "::").
 * Case-insensitive: 'usde', 'USDe', 'USDE' all resolve correctly.
 */
export function resolveTokenType(nameOrType: string): string | null {
  if (nameOrType.includes('::')) return nameOrType;
  return TOKEN_MAP[nameOrType] ?? TOKEN_MAP[nameOrType.toUpperCase()] ?? null;
}

/** Common type constants for direct import (avoid hardcoding strings). */
export const SUI_TYPE = COIN_REGISTRY.SUI.type;
export const USDC_TYPE = COIN_REGISTRY.USDC.type;
export const USDT_TYPE = COIN_REGISTRY.USDT.type;
export const USDSUI_TYPE = COIN_REGISTRY.USDSUI.type;
export const USDE_TYPE = COIN_REGISTRY.USDe.type;
export const ETH_TYPE = COIN_REGISTRY.ETH.type;
export const WBTC_TYPE = COIN_REGISTRY.wBTC.type;
export const WAL_TYPE = COIN_REGISTRY.WAL.type;
export const NAVX_TYPE = COIN_REGISTRY.NAVX.type;
