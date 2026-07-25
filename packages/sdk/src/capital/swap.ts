import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';
import { USDC_TYPE } from '../token-registry.js';
import type { SuiCoreClient } from '../utils/sui.js';
import { CETUS_GLOBAL_CONFIG_ID } from '../protocols/cetus-clmm.js';

/**
 * Direct-pool swap for agent tokens (S.815). The Cetus AGGREGATOR does not
 * route fresh pools (probed 2026-07-25: "available path is empty" for $FS),
 * so agent-token trading swaps DIRECTLY against the token's known pool via
 * the integrate package's `pool_script::swap_a2b/b2a` entry — works from
 * minute zero for every launch. Quote = a server-side simulation of the
 * same transaction (the sim IS the price; no math to drift).
 *
 * Verified by mainnet simulation both directions on the $FS pool.
 */

/** Cetus `integrate` latest published-at (mainnet, MVR v16 — their docs
 *  address table). The older ids fail the clmm version gate. */
export const CETUS_INTEGRATE_PUBLISHED_AT =
  process.env.CETUS_INTEGRATE_PUBLISHED_AT ??
  '0xfbb32ac0fa89a3cb0c56c745b688c6d2a53ac8e43447119ad822763997ffb9c3';

/** Full-range sqrt-price limits (min/max tick) — direction-dependent. */
const MIN_SQRT_PRICE = 4_295_048_016n;
const MAX_SQRT_PRICE = 79_226_673_515_401_279_992_447_579_055n;

export interface DirectPoolSwapArgs {
  client: SuiCoreClient;
  /** The swapper (signs + receives output; pays own gas — unsponsored). */
  sender: string;
  /** The agent token's Cetus pool (from the AgentToken record). */
  poolId: string;
  /** buy = USDC → AGENT · sell = AGENT → USDC. */
  direction: 'buy' | 'sell';
  /** Raw input amount (USDC 6dp for buy; token 6dp for sell). */
  amountIn: bigint;
  /** Raw minimum output — slippage floor; 0n when simulating for a quote. */
  minOut: bigint;
}

/**
 * Build the unsigned direct-pool swap. Reads the pool's `Pool<A, B>` type
 * args (pair orientation is whatever Cetus canonicalized at creation) and
 * picks `swap_a2b` / `swap_b2a` so input→output matches `direction`.
 */
export async function buildDirectPoolSwapTx(
  args: DirectPoolSwapArgs,
): Promise<Transaction> {
  if (args.amountIn <= 0n) {
    throw new T2000Error('INVALID_AMOUNT', 'amountIn must be positive');
  }
  const pool = await args.client.core
    .getObject({ objectId: args.poolId })
    .catch(() => null);
  const m = pool?.object?.type?.match(/Pool<(.+),\s*(.+)>$/);
  if (!m) {
    throw new T2000Error('PROTOCOL_UNAVAILABLE', `not a Cetus pool: ${args.poolId}`);
  }
  const [typeA, typeB] = [m[1].trim(), m[2].trim()];
  const aIsUsdc = typeA === USDC_TYPE;
  if (!aIsUsdc && typeB !== USDC_TYPE) {
    throw new T2000Error('INVALID_ASSET', 'pool is not USDC-quoted');
  }
  // buy: USDC in. USDC is A → a2b; USDC is B → b2a. sell: inverse.
  const a2b = args.direction === 'buy' ? aIsUsdc : !aIsUsdc;
  const inputType = args.direction === 'buy' ? USDC_TYPE : a2b ? typeA : typeB;

  const tx = new Transaction();
  tx.setSender(args.sender);
  const input = coinWithBalance({ type: inputType, balance: args.amountIn });
  const vec = tx.makeMoveVec({ elements: [input] });
  tx.moveCall({
    target: `${CETUS_INTEGRATE_PUBLISHED_AT}::pool_script::${a2b ? 'swap_a2b' : 'swap_b2a'}`,
    typeArguments: [typeA, typeB],
    arguments: [
      tx.object(CETUS_GLOBAL_CONFIG_ID),
      tx.object(args.poolId),
      vec,
      tx.pure.bool(true), // by_amount_in
      tx.pure.u64(args.amountIn),
      tx.pure.u64(args.minOut), // amount_limit = the slippage floor
      tx.pure.u128(a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE),
      tx.object.clock(),
    ],
  });
  return tx;
}
