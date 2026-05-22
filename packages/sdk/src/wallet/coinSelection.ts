/**
 * Wallet-side coin selection helpers — single source of truth for the
 * "produce a `Coin<T>` argument holding `amount` raw units of `coinType`,
 * owned by `address`" pattern. Used by every wallet-mode appender that
 * needs a coin input (save, send, swap, repay, stake, etc.).
 *
 * **2026-05-22 — address-balance migration.** Sui mainnet's address-balance
 * feature ships funds account-style instead of as discrete `Coin<T>` objects.
 * After a payment via `0x2::balance::send_funds`, the leftover lands in the
 * sender's address balance with a synthetic "coin reservation" representing
 * the deposit. `client.getCoins()` correctly filters those reservations out
 * (they aren't real owned objects), so the old fetch+merge+split pattern
 * threw `INSUFFICIENT_BALANCE` for users whose stables had drifted into
 * address balance — even when `getBalance().totalBalance` showed plenty.
 *
 * The fix is structural: hand the work to `coinWithBalance({ type, balance })`
 * from `@mysten/sui/transactions`. Its build-time resolver inspects coins +
 * address balance together (`getBalance` + `listCoins`), then emits the
 * right shape — direct `redeem_funds` from address balance when AB ≥
 * required, or merge-and-split across coins + AB withdrawal when not. Multi
 * intents per coin type get batched into a single merge in one PTB, so the
 * old per-PTB merge cache is no longer needed.
 *
 * Pre-flight uses `client.getBalance().totalBalance` (sums coins + AB)
 * instead of summing the paginated `getCoins` page. That's the OTHER half
 * of the migration — the legacy path could see `0` from `getCoins` and
 * mistakenly throw before `coinWithBalance` ever ran.
 */
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  Transaction,
  coinWithBalance,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';

export interface CoinPage {
  ids: string[];
  totalBalance: bigint;
}

/**
 * Sum every coin of `coinType` owned by `owner`, INCLUDING address balance.
 * Returns the IDs of any discrete coin objects that exist (callers
 * occasionally need this for non-`coinWithBalance` paths, e.g. SUIns name
 * registration which expects raw object IDs).
 *
 * Pre-2026-05-22 this function paginated `client.getCoins` and summed
 * the page balances. That misses address-balance funds (the SDK filters
 * them out of `getCoins` for back-compat). The new implementation calls
 * `getBalance` for the canonical total and `getCoins` for the optional
 * ID list — both round-trips, but they happen in parallel.
 */
export async function fetchAllCoins(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<CoinPage> {
  const [balance, ids] = await Promise.all([
    client.getBalance({ owner, coinType }),
    (async () => {
      const out: string[] = [];
      let cursor: string | null | undefined;
      let hasNext = true;
      while (hasNext) {
        const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
        for (const c of page.data) out.push(c.coinObjectId);
        cursor = page.nextCursor;
        hasNext = page.hasNextPage;
      }
      return out;
    })(),
  ]);
  return { ids, totalBalance: BigInt(balance.totalBalance) };
}

export interface SelectAndSplitResult {
  /** TransactionObjectArgument for a coin holding `effectiveAmount` raw units. */
  coin: TransactionObjectArgument;
  /** Actual raw amount the returned coin holds. May be < requested if `swapAll` is true. */
  effectiveAmount: bigint;
  /** True iff the request consumed the entire wallet balance (no split needed). */
  swapAll: boolean;
}

/**
 * Wallet-mode coin selection prelude. Pre-flights against
 * `getBalance().totalBalance` (coins + address balance combined), then
 * returns a `coinWithBalance({ type, balance })` argument that the
 * `@mysten/sui` resolver fulfills at build time.
 *
 * Throws `T2000Error` (`INSUFFICIENT_BALANCE`) when:
 * - `amount` is bigger than the total balance AND the caller did NOT
 *   opt into `swapAll: true` clipping.
 * - `amount === 'all'` AND total balance is zero.
 *
 * @param tx — PTB to register the `coinWithBalance` intent against.
 * @param client — Sui RPC client for the pre-flight `getBalance` lookup.
 * @param owner — wallet address whose coins to source from.
 * @param coinType — fully-qualified Sui coin type (e.g. `"0x...::usdc::USDC"`).
 * @param amount — raw amount to source (in MIST / smallest unit). Pass
 *   `'all'` to consume the entire balance.
 * @param options.allowSwapAll — if true (default), `amount` >= totalBalance
 *   auto-clips to total. If false, throws when the request would over-consume.
 *
 * @returns
 *   - `coin` — `TransactionObjectArgument` ready for downstream consumption.
 *   - `effectiveAmount` — the raw amount the returned coin holds (handles
 *     swapAll clipping).
 *   - `swapAll` — true iff the entire balance was consumed.
 */
export async function selectAndSplitCoin(
  tx: Transaction,
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
  amount: bigint | 'all',
  options: { allowSwapAll?: boolean } = {},
): Promise<SelectAndSplitResult> {
  const balanceResp = await client.getBalance({ owner, coinType });
  const totalBalance = BigInt(balanceResp.totalBalance);

  if (totalBalance === 0n) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `No balance found for ${coinType}`);
  }

  const allowSwapAll = options.allowSwapAll ?? true;

  if (amount !== 'all' && amount > totalBalance && !allowSwapAll) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient balance for ${coinType}`, {
      available: totalBalance.toString(),
      required: amount.toString(),
    });
  }

  const requested = amount === 'all' ? totalBalance : amount;
  const swapAll = amount === 'all' || requested >= totalBalance;
  const effectiveAmount = swapAll ? totalBalance : requested;

  const coin = coinWithBalance({ type: coinType, balance: effectiveAmount })(tx);

  return { coin, effectiveAmount, swapAll };
}

/**
 * SUI-specific coin selection. Branches on sponsorship context:
 *
 * - **Self-funded (`sponsoredContext: false`)** — splits from `tx.gas`
 *   directly (the user's gas coin IS their SUI). More efficient — no
 *   `getBalance` RTT.
 *
 * - **Sponsored (`sponsoredContext: true`)** — uses
 *   `coinWithBalance({ type: SUI, useGasCoin: false })`, because `tx.gas`
 *   belongs to the Enoki sponsor (NOT the user) under sponsored flows.
 *   The resolver sources from the user's SUI coins / address balance,
 *   not the sponsor's gas coin.
 */
export async function selectSuiCoin(
  tx: Transaction,
  client: SuiJsonRpcClient,
  owner: string,
  amountMist: bigint,
  sponsoredContext: boolean,
): Promise<SelectAndSplitResult> {
  if (sponsoredContext) {
    const { SUI_TYPE } = await import('../token-registry.js');
    const balanceResp = await client.getBalance({ owner, coinType: SUI_TYPE });
    const totalBalance = BigInt(balanceResp.totalBalance);
    if (totalBalance < amountMist) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient SUI balance`, {
        available: totalBalance.toString(),
        required: amountMist.toString(),
      });
    }
    const coin = coinWithBalance({ type: SUI_TYPE, balance: amountMist, useGasCoin: false })(tx);
    return { coin, effectiveAmount: amountMist, swapAll: false };
  }

  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  return { coin, effectiveAmount: amountMist, swapAll: false };
}
