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

// [SPEC_AGENTIC_STACK P1 / SDK F3 — 2026-05-25]
// `StableAsset` = "what we treat as worth $1 for wallet pricing and balance roll-up".
// Pre-Phase 1: USDC only — left USDsui wallet holdings invisible to balance.ts.
// Phase 1: widened to USDC + USDsui (both are NAVI-native stables with $1 peg).
// USDT / USDe stay OUT of this set deliberately — they are stables, but the
// codebase has never priced them at $1, and adding them here would require
// auditing balance.ts callers downstream. Keep the carve minimal.
export type StableAsset = 'USDC' | 'USDsui';
export const STABLE_ASSETS: readonly StableAsset[] = ['USDC', 'USDsui'] as const;

// ---------------------------------------------------------------------------
// Operation → allowed asset rules (single source of truth)
// ---------------------------------------------------------------------------

// [v4.0 Phase A Day 2 — 2026-05-26] `send` is constrained to
// `['USDC', 'USDsui', 'SUI']`. Rationale (SPEC_AGENT_WALLET_GREENFIELD §A):
// - USDC + USDsui are gasless via `0x2::balance::send_funds` (Sui mainnet
//   protocol allowlist) — the two foundation stables.
// - SUI is the only non-stable kept on the allowlist so users with no
//   stablecoin balance can still pay gas-native SUI transfers.
// - USDT, USDe, WAL, ETH, NAVX, GOLD are NOT sendable — users must swap to
//   USDC/USDsui first (one-step) or hold SUI and use a manual Move call.
// `swap` is unrestricted (Cetus routes any pair). The DeFi operations
// (save/borrow/withdraw/repay) were removed with NAVI.
export const OPERATION_ASSETS = {
  send: ['USDC', 'USDsui', 'SUI'],
  swap: '*',
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
 *
 * [v4.0 Phase A Day 2] Pre-v4 this allowed `undefined` as a silent default
 * to USDC. Removed because every write path now requires explicit asset
 * (see `T2000.send` + `buildSendTx` + `composeTx.send_transfer`). The
 * `undefined → no-op` branch is kept defensively; the `send_transfer` flow
 * validates non-undefined.
 */
export function assertAllowedAsset(op: Operation, asset: string | undefined): void {
  if (!asset) return;
  if (!isAllowedAsset(op, asset)) {
    const allowed = OPERATION_ASSETS[op];
    const list = Array.isArray(allowed) ? allowed.join(', ') : 'any';
    const swapHint =
      op === 'send' ? ' Swap to USDC or USDsui first, or send SUI.' : '';
    throw new T2000Error(
      'INVALID_ASSET',
      `${op} only supports ${list}. Cannot use ${asset}.${swapHint}`,
    );
  }
}

/**
 * [v4.0 Phase A Day 2] Narrow type alias for assets sendable through the
 * Agent Wallet. Matches `OPERATION_ASSETS.send` exactly. Exported so the
 * CLI / SDK / composeTx can share one type without re-declaring it.
 */
export type SendableAsset = 'USDC' | 'USDsui' | 'SUI';
export const SENDABLE_ASSETS: readonly SendableAsset[] = ['USDC', 'USDsui', 'SUI'] as const;

/**
 * [v4.0 Phase A Day 2] Coin types for the two gasless-allowlisted stables.
 * Used by `wallet/send.ts` + `composeTx.send_transfer` to construct the
 * `0x2::balance::send_funds` Move call's `typeArguments`. SUI is excluded
 * because SUI transfers are NOT gasless (gas-native, uses `tx.gas` split +
 * `transferObjects` per the existing path).
 */
export const GASLESS_STABLE_TYPES: Record<'USDC' | 'USDsui', string> = {
  USDC: SUPPORTED_ASSETS.USDC.type,
  USDsui: SUPPORTED_ASSETS.USDsui.type,
};

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
// gRPC fullnode endpoint. Post-flip this is the canonical transport for the
// whole SDK: `getSuiClient()` (reads + execution) AND `getSuiGrpcClient()`
// (gasless stablecoin build detection) both target it. Override the read/exec
// client with T2000_RPC_URL and the build client with T2000_GRPC_URL.
export const DEFAULT_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
export const DEFAULT_GRPC_URL = 'https://fullnode.mainnet.sui.io:443';
// [gRPC migration] GraphQL endpoint for the query surface that has NO gRPC
// `core` equivalent — `transactionBlocks` (history). Used by
// `getSuiGraphQLClient()`. The canonical mainnet host is `graphql.mainnet.sui.io`
// (parallel to the gRPC fullnode); the older `sui-mainnet.mystenlabs.com/graphql`
// host was dropped 2026-06-15 after it began resetting TLS connections (live
// smoke). Public endpoint is rate-limited — production hosts override with
// T2000_GRAPHQL_URL to a dedicated provider.
export const DEFAULT_GRAPHQL_URL = 'https://graphql.mainnet.sui.io/graphql';
export const DEFAULT_KEY_PATH = '~/.t2000/wallet.key';
export const DEFAULT_CONFIG_PATH = '~/.t2000/config.json';

// [v4.0 Phase A Day 2] Minimum stablecoin amount for protocol-level gasless
// transfers via `0x2::balance::send_funds`. The Sui mainnet allowlist enforces
// this floor at the protocol level to prevent dust spam; we surface a clear
// error before signing rather than letting the tx revert on-chain.
export const GASLESS_MIN_STABLE_AMOUNT = 0.01;

// Cetus USDC/SUI pool — read-only for SUI price oracle (no SDK dependency)
export const CETUS_USDC_SUI_POOL = '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab';

export const GAS_RESERVE_MIN = 0.05; // minimum SUI to keep for gas
