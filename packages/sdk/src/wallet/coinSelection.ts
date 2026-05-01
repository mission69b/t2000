/**
 * Wallet-side coin selection helpers — shared paginated coin lookup +
 * merge + split prelude used by every wallet-mode appender that needs
 * a `TransactionObjectArgument` reference to a specific amount of a
 * given coin type.
 *
 * Replaces three earlier inline implementations:
 * - `cetus-swap.ts:fetchAllCoinsForSwap` (kept for backwards-compat,
 *   delegates here)
 * - `volo.ts:fetchCoinsByType` (kept for backwards-compat, delegates
 *   here)
 * - audric host's `transactions/prepare/route.ts:fetchCoinsForSwap`
 *   (P2.2c retires this when migrating to `composeTx`)
 *
 * Single source of truth for the "fetch coins of type X owned by
 * address Y, paginated" pattern. P2.2b extracts this so `composeTx`'s
 * registry adapters can build a wallet-mode `TransactionObjectArgument`
 * uniformly across save / send / repay / etc.
 */
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';

export interface CoinPage {
  ids: string[];
  totalBalance: bigint;
}

/**
 * Paginated coin lookup. Fetches every coin object of `coinType` owned
 * by `owner` (walks the cursor until `hasNextPage === false`). Returns
 * the list of object IDs + summed balance.
 *
 * Replaces inline `client.getCoins` calls that miss coins on the second
 * page when wallets accumulate many small coin objects (the bug class
 * that bit `buildSendTx` pre-P2.2 — captured for SPEC 12).
 */
export async function fetchAllCoins(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<CoinPage> {
  const ids: string[] = [];
  let totalBalance = 0n;
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    for (const c of page.data) {
      ids.push(c.coinObjectId);
      totalBalance += BigInt(c.balance);
    }
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return { ids, totalBalance };
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
 * Wallet-mode coin selection prelude. Fetches every coin of `coinType`
 * owned by `owner`, merges them into a primary, and splits off the
 * requested `amount` (or returns the merged primary directly if the
 * request meets/exceeds the total balance — `swapAll` semantics).
 *
 * Throws `T2000Error` (`INSUFFICIENT_BALANCE`) when:
 * - No coins of `coinType` exist for `owner`
 * - `amount` is bigger than the total balance AND the caller did NOT
 *   opt into `swapAll: true` clipping
 *
 * Used by:
 * - `composeTx` registry adapters (save_deposit, send_transfer,
 *   repay_debt — non-SUI assets) for the wallet-mode prelude
 * - Layer 1 dual-mode appenders (`addSwapToTx`, `addStakeVSuiToTx`,
 *   `addUnstakeVSuiToTx`) when `inputCoin` is omitted
 *
 * @param tx — PTB to append `mergeCoins` + `splitCoins` commands to.
 * @param client — Sui RPC client for the paginated `getCoins` lookup.
 * @param owner — wallet address whose coins to fetch.
 * @param coinType — fully-qualified Sui coin type
 *   (`"0x...::usdc::USDC"`).
 * @param amount — raw amount to split out (in MIST / smallest unit).
 *   Pass `'all'` to consume the entire merged primary directly.
 * @param options.allowSwapAll — if true (default), `amount` >=
 *   totalBalance auto-clips to total (matches audric host's swap
 *   branch). If false, throws `INSUFFICIENT_BALANCE` when over.
 *
 * @returns
 *   - `coin` — `TransactionObjectArgument` ready for downstream
 *     consumption (e.g. `addSaveToTx`, `tx.transferObjects`).
 *   - `effectiveAmount` — the raw amount the returned coin actually
 *     holds (handles swapAll clipping).
 *   - `swapAll` — true iff the entire merged primary was consumed.
 */
export async function selectAndSplitCoin(
  tx: Transaction,
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
  amount: bigint | 'all',
  options: { allowSwapAll?: boolean } = {},
): Promise<SelectAndSplitResult> {
  const { ids, totalBalance } = await fetchAllCoins(client, owner, coinType);
  if (ids.length === 0) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `No coins found for ${coinType}`);
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

  const primary = tx.object(ids[0]);
  if (ids.length > 1) {
    tx.mergeCoins(primary, ids.slice(1).map((id) => tx.object(id)));
  }

  const coin = swapAll ? primary : tx.splitCoins(primary, [effectiveAmount])[0];
  return { coin, effectiveAmount, swapAll };
}

/**
 * SUI-specific coin selection. Branches on sponsorship context:
 *
 * - **Sponsored (`sponsoredContext: true`)** — fetches SUI coins via
 *   `getCoins` and merges/splits, because `tx.gas` belongs to the
 *   Enoki sponsor (NOT the user) under sponsored flows. Same shape as
 *   `selectAndSplitCoin` for any other coin type.
 *
 * - **Self-funded (`sponsoredContext: false`)** — splits from `tx.gas`
 *   directly (the user's gas coin IS their SUI). More efficient — no
 *   getCoins RTT.
 *
 * Captures the SUI-vs-other-asset divergence that lives inline in
 * `buildSendTx` today (`tx.splitCoins(tx.gas, ...)` vs paginated
 * lookup). composeTx's `send_transfer` adapter routes through this
 * helper to handle both.
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
    return selectAndSplitCoin(tx, client, owner, SUI_TYPE, amountMist);
  }

  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  return { coin, effectiveAmount: amountMist, swapAll: false };
}
