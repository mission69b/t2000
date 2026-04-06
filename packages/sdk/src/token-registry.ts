/**
 * Unified token registry — single source of truth for coin types, decimals, symbols, and tiers.
 *
 * ZERO heavy dependencies. Safe to import from any context (server, browser, Edge).
 *
 * Tier 1: USDC — the financial layer (save, borrow, receive, yield, allowances, marketplace, MPP).
 * Tier 2: 13 curated swap assets — hold, trade, and send only.
 * No tier: Legacy tokens kept for display accuracy (existing NAVI positions). No new operations.
 *
 * To add a new token: add ONE entry to COIN_REGISTRY below. Everything else derives from it.
 * Gate for Tier 2 addition: confirmed deep Cetus liquidity + clear user need.
 */

export interface CoinMeta {
  type: string;
  decimals: number;
  symbol: string;
  tier?: 1 | 2;
}

/**
 * Canonical coin registry.
 * Key = user-friendly name (used in swap_execute, CLI, prompts).
 */
export const COIN_REGISTRY: Record<string, CoinMeta> = {
  // ── Tier 1 — Financial layer ──────────────────────────────────────────
  USDC:     { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6, symbol: 'USDC', tier: 1 },

  // ── Tier 2 — Swap assets (13 tokens) ──────────────────────────────────
  SUI:      { type: '0x2::sui::SUI', decimals: 9, symbol: 'SUI', tier: 2 },
  wBTC:     { type: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC', decimals: 8, symbol: 'wBTC', tier: 2 },
  ETH:      { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8, symbol: 'ETH', tier: 2 },
  GOLD:     { type: '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM', decimals: 6, symbol: 'GOLD', tier: 2 },
  DEEP:     { type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', decimals: 6, symbol: 'DEEP', tier: 2 },
  WAL:      { type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL', decimals: 9, symbol: 'WAL', tier: 2 },
  NS:       { type: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS', decimals: 6, symbol: 'NS', tier: 2 },
  IKA:      { type: '0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA', decimals: 9, symbol: 'IKA', tier: 2 },
  CETUS:    { type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS', decimals: 9, symbol: 'CETUS', tier: 2 },
  NAVX:     { type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX', decimals: 9, symbol: 'NAVX', tier: 2 },
  vSUI:     { type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT', decimals: 9, symbol: 'vSUI', tier: 2 },
  LOFI:     { type: '0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI', decimals: 9, symbol: 'LOFI', tier: 2 },
  MANIFEST: { type: '0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST', decimals: 9, symbol: 'MANIFEST', tier: 2 },

  // ── Legacy — no tier, kept for display accuracy on existing positions ──
  USDT:     { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6, symbol: 'USDT' },
  USDe:     { type: '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE', decimals: 6, symbol: 'USDe' },
  USDSUI:   { type: '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI', decimals: 6, symbol: 'USDsui' },
};

/** Reverse lookup: coin type → CoinMeta. Built once at import time. */
const BY_TYPE = new Map<string, CoinMeta>();
for (const meta of Object.values(COIN_REGISTRY)) {
  BY_TYPE.set(meta.type, meta);
}

// ── Tier helpers ─────────────────────────────────────────────────────────

/** Returns true if the coin type is Tier 1 (USDC — the financial layer). */
export function isTier1(coinType: string): boolean {
  const meta = BY_TYPE.get(coinType);
  return meta?.tier === 1;
}

/** Returns true if the coin type is Tier 2 (curated swap asset). */
export function isTier2(coinType: string): boolean {
  const meta = BY_TYPE.get(coinType);
  return meta?.tier === 2;
}

/** Returns true if the coin type is actively supported (Tier 1 or Tier 2). */
export function isSupported(coinType: string): boolean {
  const meta = BY_TYPE.get(coinType);
  return meta?.tier !== undefined;
}

/** Returns the tier for a coin type, or undefined if legacy/unknown. */
export function getTier(coinType: string): 1 | 2 | undefined {
  return BY_TYPE.get(coinType)?.tier;
}

// ── Lookup helpers ───────────────────────────────────────────────────────

/**
 * Get decimals for any coin type. Checks full type match, then suffix match, then defaults to 9.
 * Works for both tiered and legacy tokens.
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

/** Common type constants for direct import. */
export const SUI_TYPE = COIN_REGISTRY.SUI.type;
export const USDC_TYPE = COIN_REGISTRY.USDC.type;
export const USDT_TYPE = COIN_REGISTRY.USDT.type;
export const USDSUI_TYPE = COIN_REGISTRY.USDSUI.type;
export const USDE_TYPE = COIN_REGISTRY.USDe.type;
export const ETH_TYPE = COIN_REGISTRY.ETH.type;
export const WBTC_TYPE = COIN_REGISTRY.wBTC.type;
export const WAL_TYPE = COIN_REGISTRY.WAL.type;
export const NAVX_TYPE = COIN_REGISTRY.NAVX.type;
export const IKA_TYPE = COIN_REGISTRY.IKA.type;
export const LOFI_TYPE = COIN_REGISTRY.LOFI.type;
export const MANIFEST_TYPE = COIN_REGISTRY.MANIFEST.type;
