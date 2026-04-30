import { T2000Error } from './errors.js';

export const MIST_PER_SUI = 1_000_000_000n;
export const SUI_DECIMALS = 9;
export const USDC_DECIMALS = 6;

export const BPS_DENOMINATOR = 10_000n;
export const PRECISION = 1_000_000_000_000_000_000n;

export const MIN_DEPOSIT = 1_000_000n; // 1 USDC (6 decimals)

export const SAVE_FEE_BPS = 10n; // 0.1%
export const BORROW_FEE_BPS = 5n; // 0.05%

export const CLOCK_ID = '0x6';

export const SUPPORTED_ASSETS = {
  USDC: {
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
    symbol: 'USDC',
    displayName: 'USDC',
  },
  USDT: {
    type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
    decimals: 6,
    symbol: 'USDT',
    displayName: 'suiUSDT',
  },
  USDe: {
    type: '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE',
    decimals: 6,
    symbol: 'USDe',
    displayName: 'suiUSDe',
  },
  USDsui: {
    type: '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI',
    decimals: 6,
    symbol: 'USDsui',
    displayName: 'USDsui',
  },
  SUI: {
    type: '0x2::sui::SUI',
    decimals: 9,
    symbol: 'SUI',
    displayName: 'SUI',
  },
  WAL: {
    type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
    decimals: 9,
    symbol: 'WAL',
    displayName: 'WAL',
  },
  ETH: {
    type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
    decimals: 8,
    symbol: 'ETH',
    displayName: 'suiETH',
  },
  NAVX: {
    type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
    decimals: 9,
    symbol: 'NAVX',
    displayName: 'NAVX',
  },
  GOLD: {
    type: '0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM',
    decimals: 6,
    symbol: 'GOLD',
    displayName: 'XAUM',
  },
} as const;

export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;
export type StableAsset = 'USDC';
export const STABLE_ASSETS: readonly StableAsset[] = ['USDC'] as const;
export const ALL_NAVI_ASSETS: readonly SupportedAsset[] = Object.keys(SUPPORTED_ASSETS) as SupportedAsset[];

// ---------------------------------------------------------------------------
// Operation → allowed asset rules (single source of truth)
// ---------------------------------------------------------------------------

// [v0.51.0] Saveable/borrowable set: USDC + USDsui.
// USDC is the canonical default; USDsui is a strategic exception backed by an
// existing NAVI pool. See `.cursor/rules/savings-usdc-only.mdc` for the
// rationale and the rule that gates additional stables (don't add more here
// without updating that file).
export const OPERATION_ASSETS = {
  save:     ['USDC', 'USDsui'],
  borrow:   ['USDC', 'USDsui'],
  withdraw: '*',
  repay:    '*',
  send:     '*',
  swap:     '*',
} as const;

export type Operation = keyof typeof OPERATION_ASSETS;

export function isAllowedAsset(op: Operation, asset: string): boolean {
  const allowed = OPERATION_ASSETS[op];
  if (allowed === '*') return true;
  // [v0.51.0] Mixed-case canonical keys (USDsui, suiUSDT) need case-insensitive
  // membership. Pre-v0.51 we only had USDC ↔ USDC (uppercase identity), so
  // a one-sided uppercase compare looked correct. Now that USDsui is in the
  // set, normalize both sides.
  const target = asset.toLowerCase();
  return (allowed as readonly string[]).some((a) => a.toLowerCase() === target);
}

/**
 * Throws if the asset is not permitted for the given operation.
 * Passing `undefined` (omitted) is always valid — defaults to USDC.
 */
export function assertAllowedAsset(op: Operation, asset: string | undefined): void {
  if (!asset) return;
  if (!isAllowedAsset(op, asset)) {
    const allowed = OPERATION_ASSETS[op];
    const list = Array.isArray(allowed) ? allowed.join(', ') : 'any';
    throw new T2000Error(
      'INVALID_ASSET',
      `${op} only supports ${list}. Cannot use ${asset}.${op === 'save' ? ' Swap to USDC or USDsui first.' : ''}`,
    );
  }
}

// All protocol fees route here as a regular USDC wallet transfer. Audric's
// prepare/route.ts adds `addFeeTransfer(...)` inline for save/borrow and passes
// `overlayFee.receiver = T2000_OVERLAY_FEE_WALLET` for swaps. The CLI/SDK never
// charge fees — this constant is exported for consumer apps only.
//
// Address corresponds to the treasury admin wallet. Override via env for local dev /
// testnet only — production must use the canonical mainnet address below.
export const T2000_OVERLAY_FEE_WALLET = process.env.T2000_OVERLAY_FEE_WALLET
  ?? '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';

export const DEFAULT_NETWORK = 'mainnet' as const;
export const DEFAULT_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
export const DEFAULT_KEY_PATH = '~/.t2000/wallet.key';
export const DEFAULT_CONFIG_PATH = '~/.t2000/config.json';

export const API_BASE_URL = process.env.T2000_API_URL ?? 'https://api.t2000.ai';

// Cetus USDC/SUI pool — read-only for SUI price oracle (no SDK dependency)
export const CETUS_USDC_SUI_POOL = '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab';

export const GAS_RESERVE_MIN = 0.05; // minimum SUI to keep for gas
