/**
 * NAVI rewards harvest — single-PTB compound flow.
 *
 * **Goal.** Bundle the three-step "claim → swap → save" reward-cycling
 * routine into ONE atomic Programmable Transaction Block so the user
 * sees ONE confirm card instead of three sequential ones, and so the
 * legs settle together (or revert together — no half-claimed-but-
 * unsaved drift).
 *
 * **Flow.**
 *   1. Read pending rewards via NAVI's `getUserAvailableLendingRewards`
 *      (same source as `getPendingRewards` + `addClaimRewardsToTx`, so
 *      what the user sees in `pending_rewards` is exactly what gets
 *      harvested — no drift).
 *   2. Append `claimLendingRewardsPTB(... { customCoinReceive: { type: 'skip' }})`
 *      so the claimed coin handles are returned as `TransactionObjectArgument`
 *      handles instead of being transferred to the wallet — they stay
 *      consumable inside the same PTB.
 *   3. For each claimed handle:
 *        • If the reward IS USDC, hold the handle for the deposit step.
 *        • If the reward is in `COIN_REGISTRY` AND tradeable on Cetus
 *          (any tier-2 token effectively), append `addSwapToTx` in chain
 *          mode using the claimed coin as `inputCoin`. Collect the USDC
 *          output handle.
 *        • Else (untradeable / non-registry), transfer the claimed coin
 *          back to the user's wallet — preserves the reward but skips
 *          the auto-deposit (the user keeps it as a wallet asset).
 *   4. Merge all collected USDC handles via `tx.mergeCoins`, then deposit
 *      via `addSaveToTx`.
 *
 * **Atomicity.** Single PTB = single transaction = single sponsored-gas
 * envelope. Either ALL legs settle (claim + swap(s) + deposit) or none
 * do. No partial-state recovery code needed.
 *
 * **Sponsored-gas posture.** This builder appends ONLY chained move
 * calls — no `tx.gas` reads, no Pyth fee writes, no oracle Pyth updates.
 * Cetus chain-mode swaps with `slippage` ≤ 5% don't require Pyth either
 * (Cetus aggregator routes around Pyth-dependent providers when callers
 * pass `providers: getProvidersExcluding(...)`). Audric's host wires
 * the provider exclusion automatically for Enoki sponsorship — see
 * `cetus-swap.ts` JSDoc.
 *
 * **Dust filter.** Rewards with `amount * priceCache.get(symbol) <
 * minRewardUsd` are skipped from the swap leg AND from the deposit —
 * not worth the gas to swap dust. They get transferred back to the
 * wallet (preserving on-chain truth: the claim happened, the swap
 * didn't). Default minRewardUsd = $0.01.
 *
 * **Failure modes.**
 *   - PROTOCOL_UNAVAILABLE — NAVI rewards lookup or claim PTB build failed.
 *     Engine surfaces "NAVI is degraded right now."
 *   - SWAP_NO_ROUTE — a reward asset has no Cetus route. Logged + that
 *     leg is skipped (rewards transferred to wallet). Other legs proceed.
 *   - INVALID_AMOUNT — rewards array empty after dust filter (nothing
 *     worth harvesting). Throws so the engine narrates "nothing to
 *     harvest right now" instead of building a no-op PTB.
 *
 * **Why a separate file (not inside `navi.ts`).** This composition
 * crosses two protocols (NAVI + Cetus) — keeping it out of `navi.ts`
 * preserves the single-protocol-per-file invariant the rest of the SDK
 * follows. Mirrors how `cetus-swap.ts` already lives separately even
 * though it composes through `composeTx.ts`.
 */

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { getUserAvailableLendingRewards, claimLendingRewardsPTB } from '@naviprotocol/lending';
import { T2000Error } from '../errors.js';
import { getCoinMeta, USDC_TYPE } from '../token-registry.js';
import { addSaveToTx, aggregateClaimableRewards } from './navi.js';
import { addSwapToTx, type OverlayFeeConfig } from './cetus-swap.js';
import type { PendingReward } from '../adapters/types.js';

// -- types --------------------------------------------------------------

export interface HarvestSwapLeg {
  /** Reward symbol pre-swap (e.g. 'vSUI', 'NAVX'). */
  fromSymbol: string;
  /** Reward coinType pre-swap. */
  fromCoinType: string;
  /** Always 'USDC' — this builder only deposits to the USDC pool. */
  toSymbol: 'USDC';
  /** Display-units input amount (the entire claimed reward for that coin). */
  inputAmount: number;
  /** Display-units USDC the swap quote estimated. Actual on-chain may differ within slippage. */
  expectedOutputUsdc: number;
}

export interface HarvestSkippedLeg {
  /** Reward symbol skipped (untradeable, dust, or no-route). */
  symbol: string;
  coinType: string;
  /** Display-units claimed amount (still credited to user's wallet — just not auto-deposited). */
  amount: number;
  /** 'untradeable' | 'dust' | 'no-route' */
  reason: 'untradeable' | 'dust' | 'no-route';
}

export interface HarvestPlan {
  /** Every reward that WILL be claimed by this PTB. */
  claimed: PendingReward[];
  /** Each non-USDC reward that WILL be swapped to USDC inline. */
  swaps: HarvestSwapLeg[];
  /** Rewards claimed but transferred back to wallet (no auto-deposit). */
  skipped: HarvestSkippedLeg[];
  /** Display-units USDC that will be deposited to the NAVI USDC pool. */
  expectedUsdcDeposited: number;
}

/**
 * Callback invoked right before the harvest's internal `addSaveToTx`.
 * Mirrors the shape of `composeTx`'s `feeHooks.save_deposit` so audric's
 * existing hook can be threaded straight through without adapters. The
 * SDK never invents a fee — the host decides whether to skim from
 * `coin` and to where. See CLAUDE.md rule #9 (fees are a host concern).
 */
export type HarvestSaveFeeHook = (ctx: {
  tx: Transaction;
  coin: TransactionObjectArgument;
  input: { asset: 'USDC'; amount: number };
  sender: string;
}) => void | Promise<void>;

export interface BuildHarvestRewardsTxOptions {
  /** Per-swap slippage tolerance (0.001–0.05). Defaults to 0.01 (1%). */
  slippage?: number;
  /**
   * USD floor for "is this worth swapping?". Rewards below this threshold
   * get transferred back to the wallet instead of swapped. Default $0.01.
   * Pass 0 to disable the filter (always swap; useful for tests).
   */
  minRewardUsd?: number;
  /**
   * Symbol → USD price map. Sourced from the engine's `ToolContext.priceCache`
   * in production; tests can pass a literal Map. When undefined, the dust
   * filter degrades to "skip nothing" (every reward is swapped) so we don't
   * accidentally drop large rewards just because we couldn't price them.
   */
  priceCache?: Map<string, number>;
  /**
   * Cetus provider allow-list. Sponsored callers (Enoki) pass
   * `getProvidersExcluding(['pyth-dependent-list'])` to keep the PTB
   * Pyth-free. Non-sponsored callers omit this.
   */
  providers?: string[];
  /**
   * [v1.24.2 fee wiring] Overlay fee forwarded to EACH internal
   * `addSwapToTx` call. When set, every swap leg charges the rate to
   * the receiver (typically `T2000_OVERLAY_FEE_WALLET` for audric).
   * Omit for fee-free harvests (CLI / direct SDK callers).
   */
  overlayFee?: OverlayFeeConfig;
  /**
   * [v1.24.2 fee wiring] Fired immediately before the internal
   * `addSaveToTx` consumes the merged USDC deposit coin. The hook
   * receives the deposit handle so it can split a fee off via
   * `addFeeTransfer(...)` (host's call). Audric threads its
   * `feeHooks.save_deposit` straight through here so a harvest's
   * deposit leg pays the same `SAVE_FEE_BPS` as a single-op `save`.
   *
   * Order is load-bearing: this hook fires AFTER all USDC handles
   * are merged into one and BEFORE the NAVI deposit consumes it.
   * Fee receiver gets recorded as a top-level transferObjects, so
   * it's automatically picked up by `derivedAllowedAddresses`.
   */
  saveFeeHook?: HarvestSaveFeeHook;
}

// -- builders -----------------------------------------------------------

/**
 * Append the harvest legs (claim → swap(s) → save) to an EXISTING PTB.
 * Used by `composeTx`'s `harvest_rewards` registry appender so harvest
 * fits the same orchestration pattern as every other write tool.
 *
 * Standalone callers (CLI, smoke tests) should use `buildHarvestRewardsTx`
 * which wraps this with `tx.setSender(address)` and a fresh `Transaction`.
 */
export async function addHarvestToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  options: BuildHarvestRewardsTxOptions = {},
): Promise<HarvestPlan> {
  const slippage = options.slippage ?? 0.01;
  const minRewardUsd = options.minRewardUsd ?? 0.01;
  const priceCache = options.priceCache;

  // Step 1 — read pending rewards. Same source + same shape as
  // `getPendingRewards` so users see EXACTLY what they're about to harvest.
  let rawRewards;
  try {
    rawRewards = await getUserAvailableLendingRewards(address, {
      env: 'prod',
      client: client as never,
      markets: ['main'],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error(
      'PROTOCOL_UNAVAILABLE',
      `NAVI rewards lookup failed: ${msg}`,
      { source: 'navi-harvest-read' },
      true,
    );
  }

  const claimable = (rawRewards ?? []).filter((r) => Number(r.userClaimableReward) > 0);
  if (claimable.length === 0) {
    throw new T2000Error(
      'INVALID_AMOUNT',
      'No pending rewards to harvest.',
      { source: 'navi-harvest' },
    );
  }

  // Pre-aggregate so the plan + the claim PTB receive the SAME view —
  // mirrors `addClaimRewardsToTx`'s aggregation step. The PTB still gets
  // the raw `claimable` list (NAVI iterates per-pool internally); the
  // plan output uses the aggregated view (one row per coin, like the
  // `pending_rewards` tool surfaces).
  const aggregated = aggregateClaimableRewards(claimable);

  let claimed: Array<{ coin: TransactionObjectArgument; coinType: string }>;
  try {
    const claimResult = await claimLendingRewardsPTB(tx, claimable, {
      env: 'prod',
      // 'skip' = NAVI doesn't auto-transfer; coin handles stay in the PTB
      // for downstream consumption. Verified against NAVI lending source
      // (index.esm.js@1828–1911) — when type !== 'transfer' && type !==
      // 'depositNAVI', the `else` branch pushes `{ coin, identifier, ... }`
      // to the return without consuming the handle.
      customCoinReceive: { type: 'skip' as const },
    });
    // NAVI's claim emits ONE entry per (asset, reward-type) row, NOT one
    // per claimable input row. Group by coin type to match the swap-plan
    // shape (one swap per coin type, regardless of how many pools it
    // came from).
    const grouped = new Map<string, TransactionObjectArgument[]>();
    for (const c of claimResult) {
      // c.identifier is a NAVI Pool — the suiCoinType field is the reward coin's full type.
      const ct = (c.identifier as { suiCoinType?: string }).suiCoinType ?? '';
      if (!ct) continue;
      const list = grouped.get(ct) ?? [];
      list.push(c.coin);
      grouped.set(ct, list);
    }
    // For each coin type, merge all NAVI-emitted handles into one (so
    // each coin type yields exactly ONE handle for swap/save chaining).
    claimed = [];
    for (const [coinType, handles] of grouped.entries()) {
      if (handles.length === 1) {
        claimed.push({ coin: handles[0], coinType });
      } else {
        // mergeCoins: tx.mergeCoins(destination, [sources...]) — destination
        // is the first; absorbs the rest; returns destination ref.
        const [dest, ...rest] = handles;
        tx.mergeCoins(dest, rest);
        claimed.push({ coin: dest, coinType });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new T2000Error(
      'PROTOCOL_UNAVAILABLE',
      `NAVI claim PTB build failed: ${msg}`,
      { source: 'navi-harvest-claim-ptb' },
      true,
    );
  }

  // Step 3 — classify each claimed coin: USDC (deposit-eligible), tradeable
  // (swap then deposit), or untradeable (transfer to wallet).
  const usdcHandles: TransactionObjectArgument[] = [];
  const swaps: HarvestSwapLeg[] = [];
  const skipped: HarvestSkippedLeg[] = [];

  // For computing expected USDC totals — sum claimed USDC + each swap quote.
  let expectedUsdcDeposited = 0;

  for (const { coin, coinType } of claimed) {
    const aggRow = aggregated.find((r) => r.coinType === coinType);
    if (!aggRow) {
      // Defensive — shouldn't happen since claimable feeds both paths.
      continue;
    }

    if (coinType === USDC_TYPE) {
      usdcHandles.push(coin);
      expectedUsdcDeposited += aggRow.amount;
      continue;
    }

    const meta = getCoinMeta(coinType);
    const isTradeable = meta && (meta.tier === 1 || meta.tier === 2);
    if (!isTradeable) {
      tx.transferObjects([coin], address);
      skipped.push({
        symbol: aggRow.symbol,
        coinType,
        amount: aggRow.amount,
        reason: 'untradeable',
      });
      continue;
    }

    // Dust filter — only when we have a price for the symbol.
    if (priceCache && minRewardUsd > 0) {
      const px = priceCache.get(aggRow.symbol.toUpperCase());
      if (px && px > 0 && aggRow.amount * px < minRewardUsd) {
        tx.transferObjects([coin], address);
        skipped.push({
          symbol: aggRow.symbol,
          coinType,
          amount: aggRow.amount,
          reason: 'dust',
        });
        continue;
      }
    }

    // Tradeable + above-dust — append swap leg in chain mode.
    try {
      const swapResult = await addSwapToTx(tx, client, address, {
        from: aggRow.symbol,
        to: 'USDC',
        amount: aggRow.amount,
        slippage,
        inputCoin: coin,
        providers: options.providers,
        overlayFee: options.overlayFee,
      });
      usdcHandles.push(swapResult.coin);
      expectedUsdcDeposited += swapResult.expectedAmountOut;
      swaps.push({
        fromSymbol: aggRow.symbol,
        fromCoinType: coinType,
        toSymbol: 'USDC',
        inputAmount: swapResult.effectiveAmountIn,
        expectedOutputUsdc: swapResult.expectedAmountOut,
      });
    } catch (err) {
      // SWAP_NO_ROUTE / SWAP_FAILED for this leg → transfer to wallet
      // and continue. Other reward legs still settle.
      const code = err instanceof T2000Error ? err.code : 'UNKNOWN';
      if (code !== 'SWAP_NO_ROUTE' && code !== 'SWAP_FAILED') {
        // Non-routing failure (e.g. provider down) — re-throw so the user
        // doesn't silently get a degraded harvest.
        throw err;
      }
      tx.transferObjects([coin], address);
      skipped.push({
        symbol: aggRow.symbol,
        coinType,
        amount: aggRow.amount,
        reason: 'no-route',
      });
    }
  }

  // Step 4 — merge USDC handles + deposit, OR no-op if nothing to deposit.
  if (usdcHandles.length > 0) {
    let depositCoin: TransactionObjectArgument;
    if (usdcHandles.length === 1) {
      depositCoin = usdcHandles[0];
    } else {
      const [primary, ...rest] = usdcHandles;
      tx.mergeCoins(primary, rest);
      depositCoin = primary;
    }
    // [v1.24.2 fee wiring] Skim the host's save fee BEFORE deposit
    // consumes the coin. Same ordering rule as the single-op `save`
    // path: feeHooks.save_deposit fires after the user's USDC is in
    // hand, before the NAVI deposit move call. `expectedUsdcDeposited`
    // is the pre-fee total (claimed USDC + each swap quote); the hook
    // skims a fraction of it and the NAVI deposit consumes the
    // remainder.
    if (options.saveFeeHook) {
      await options.saveFeeHook({
        tx,
        coin: depositCoin,
        input: { asset: 'USDC', amount: expectedUsdcDeposited },
        sender: address,
      });
    }
    try {
      await addSaveToTx(tx, client, address, depositCoin, { asset: 'USDC' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new T2000Error(
        'PROTOCOL_UNAVAILABLE',
        `NAVI deposit failed during harvest: ${msg}`,
        { source: 'navi-harvest-deposit' },
        true,
      );
    }
  }
  // If usdcHandles is empty, all rewards were skipped (untradeable / dust /
  // no-route) and transferred to the wallet — no deposit needed. The plan
  // returns expectedUsdcDeposited = 0, which the engine tool surfaces as
  // "claimed X but nothing to deposit; rewards are in your wallet."

  return {
    claimed: aggregated,
    swaps,
    skipped,
    expectedUsdcDeposited,
  };
}

/**
 * Standalone harvest builder — creates a fresh PTB, sets the sender,
 * appends the full harvest flow, and returns both the tx and the plan.
 * Used by CLI / direct SDK callers (smoke tests, scripts). The audric
 * host goes through `composeTx({ steps: [{ toolName: 'harvest_rewards' }] })`
 * which wires the appender + Enoki sponsorship.
 */
export async function buildHarvestRewardsTx(
  client: SuiJsonRpcClient,
  address: string,
  options: BuildHarvestRewardsTxOptions = {},
): Promise<{ tx: Transaction; plan: HarvestPlan }> {
  const tx = new Transaction();
  tx.setSender(address);
  const plan = await addHarvestToTx(tx, client, address, options);
  return { tx, plan };
}

