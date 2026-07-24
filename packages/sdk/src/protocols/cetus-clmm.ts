import {
  Transaction,
  type TransactionArgument,
  type TransactionResult,
} from '@mysten/sui/transactions';

/**
 * Cetus CLMM — pool creation + position plumbing for Agent Capital launches
 * (SPEC_ACP_SUI §6). ISOLATED like `cetus-swap.ts`: this is the only file that
 * may reference the Cetus CLMM surface.
 *
 * Deliberately NOT the Cetus CLMM TS SDK — pool creation is three moveCalls
 * against the on-chain package (`pool_creator::create_pool_v2`,
 * `position::pool_id`, `pool_creator::full_range_tick_range`), which is
 * exactly the "thin `@mysten/sui` tx builders" shape Critical Rule 2 asks
 * for. The aggregator SDK exception stays scoped to swaps.
 *
 * Signatures pinned against `cetus-clmm-interface` tag `mainnet-v1.52.3`
 * (same tag the Move package depends on).
 */

/** Cetus CLMM original package id (mainnet) — TYPE references (Position, …)
 *  and moveCall targets resolve through it; the runtime routes to the latest
 *  upgraded version recorded on-chain. */
export const CETUS_CLMM_PACKAGE_ID =
  process.env.CETUS_CLMM_PACKAGE_ID ??
  '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';

/** Cetus CLMM latest published id (mainnet, published-version 14) — moveCall
 *  targets must use THIS so version-gated entry functions link current code. */
export const CETUS_CLMM_PUBLISHED_AT =
  process.env.CETUS_CLMM_PUBLISHED_AT ??
  '0x25ebb9a7c50eb17b3fa9c5a30fb8b5ad8f97caaf4928943acbcff7153dfee5e3';

/** Shared `GlobalConfig` (mainnet). */
export const CETUS_GLOBAL_CONFIG_ID =
  process.env.CETUS_GLOBAL_CONFIG_ID ??
  '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

/** Shared `factory::Pools` (mainnet). */
export const CETUS_POOLS_ID =
  process.env.CETUS_POOLS_ID ??
  '0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0';

/** The canonical Position type tag (original package id, per Sui type rules). */
export const CETUS_POSITION_TYPE = `${CETUS_CLMM_PACKAGE_ID}::position::Position`;

/**
 * Tick spacing 200 = the 1% fee tier — the Virtuals-shape choice for agent
 * tokens: maximum fee flow to the agent wallet on a volatile new pair.
 */
export const AGENT_POOL_TICK_SPACING = 200;

/**
 * sqrt(priceOfAInB) in UQ64.64, computed exactly in bigints:
 * `sqrt((rawB << 128) / rawA)` — the initial pool price implied by seeding
 * `rawA` of coin A against `rawB` of coin B.
 */
export function sqrtPriceX64FromAmounts(rawA: bigint, rawB: bigint): bigint {
  if (rawA <= 0n || rawB <= 0n) {
    throw new Error('sqrtPriceX64FromAmounts: amounts must be positive');
  }
  return bigintSqrt((rawB << 128n) / rawA);
}

/** Integer square root (Newton's method) — floor(sqrt(n)). */
export function bigintSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('bigintSqrt: negative input');
  if (n < 2n) return n;
  let x = 1n << (BigInt(n.toString(2).length + 1) / 2n);
  let prev = x + 1n;
  while (x < prev) {
    prev = x;
    x = (x + n / x) / 2n;
  }
  return prev;
}

export interface CreatePoolArgs {
  /** Fully-qualified coin type of side A (must be Cetus-canonical order vs B). */
  coinTypeA: string;
  coinTypeB: string;
  /** `CoinMetadata` object ids for both sides. */
  metadataA: string;
  metadataB: string;
  /** Coin<A> / Coin<B> PTB inputs to seed liquidity from. */
  coinA: TransactionArgument;
  coinB: TransactionArgument;
  sqrtPriceX64: bigint;
  /** true → deposit exactly coin A's amount, refund from B; false → fix B. */
  fixAmountA: boolean;
  /** Pool display url — the agent's icon; may be ''. */
  url?: string;
}

/**
 * `pool_creator::create_pool_v2` — permissionless pool + initial full-range
 * position in one call. Returns `[Position, Coin<A> refund, Coin<B> refund]`
 * as PTB results.
 */
export function createPoolV2(tx: Transaction, args: CreatePoolArgs): TransactionResult {
  const [tickLower, tickUpper] = fullRangeTickRange(tx);
  return tx.moveCall({
    target: `${CETUS_CLMM_PUBLISHED_AT}::pool_creator::create_pool_v2`,
    typeArguments: [args.coinTypeA, args.coinTypeB],
    arguments: [
      tx.object(CETUS_GLOBAL_CONFIG_ID),
      tx.object(CETUS_POOLS_ID),
      tx.pure.u32(AGENT_POOL_TICK_SPACING),
      tx.pure.u128(args.sqrtPriceX64),
      tx.pure.string(args.url ?? ''),
      tickLower,
      tickUpper,
      args.coinA,
      args.coinB,
      tx.object(args.metadataA),
      tx.object(args.metadataB),
      tx.pure.bool(args.fixAmountA),
      tx.object.clock(),
    ],
  });
}

/** `pool_creator::full_range_tick_range(tick_spacing)` — on-chain tick math,
 *  no TS reimplementation to drift. Returns `[u32, u32]` PTB results. */
function fullRangeTickRange(tx: Transaction): [TransactionArgument, TransactionArgument] {
  const result = tx.moveCall({
    target: `${CETUS_CLMM_PUBLISHED_AT}::pool_creator::full_range_tick_range`,
    arguments: [tx.pure.u32(AGENT_POOL_TICK_SPACING)],
  });
  return [result[0], result[1]];
}

/** `position::pool_id(&Position)` — reads the pool ID off the position NFT so
 *  the same PTB can record it in `agent_capital::registry::finalize`. */
export function positionPoolId(
  tx: Transaction,
  position: TransactionArgument,
): TransactionResult {
  return tx.moveCall({
    target: `${CETUS_CLMM_PUBLISHED_AT}::position::pool_id`,
    arguments: [position],
  });
}

/**
 * Cetus pools require the (A, B) pair in canonical order. The comparator is
 * not re-implemented here (it lives in the on-chain factory): the launch
 * orchestrator SIMULATES with (AGENT, SUI) and flips to (SUI, AGENT) if the
 * factory aborts — deterministic and immune to comparator drift.
 */
export const POOL_ORDER_NOTE =
  'pair order resolved by simulation, not a local comparator';
