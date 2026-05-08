/**
 * Protocol fee primitives — wallet-direct transfer model.
 *
 * Fees are collected by splitting from the payment coin and transferring directly
 * to the treasury wallet inside the same PTB. Atomic with the operation (PTB
 * semantics); the wallet IS the ledger; the server-side indexer reads
 * `balanceChanges` and writes a `ProtocolFeeLedger` row tagged with the operation
 * classified from the tx's moveCall targets.
 *
 * The SDK / CLI never call this helper — they're fee-free by design (t2000 = infra
 * brand, no opinion on fees). Audric's `prepare/route.ts` is the canonical caller.
 */
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import {
  SAVE_FEE_BPS,
  BORROW_FEE_BPS,
  BPS_DENOMINATOR,
  USDC_DECIMALS,
} from '../constants.js';
import { stableToRaw } from '../utils/format.js';

export type FeeOperation = 'save' | 'borrow' | 'swap';

export interface ProtocolFeeInfo {
  amount: number;
  asset: string;
  rate: number;
  rawAmount: bigint;
}

const FEE_RATES: Record<FeeOperation, bigint> = {
  save: SAVE_FEE_BPS,
  borrow: BORROW_FEE_BPS,
  // Swap uses Cetus's overlay-fee mechanism (taken from output by the aggregator
  // and transferred to `overlayFee.receiver`). We list the rate here for display
  // / quote calculations only — `addFeeTransfer` is NOT called for swaps.
  swap: 10n, // 0.1%
};

/**
 * Compute the fee amount for a given operation against a USD-denominated input.
 * Used pre-tx for receipt display + quote math. Does not modify any tx.
 */
export function calculateFee(operation: FeeOperation, amount: number): ProtocolFeeInfo {
  const bps = FEE_RATES[operation];
  const feeAmount = amount * Number(bps) / Number(BPS_DENOMINATOR);
  const rawAmount = stableToRaw(feeAmount, USDC_DECIMALS);

  return {
    amount: feeAmount,
    asset: 'USDC',
    rate: Number(bps) / Number(BPS_DENOMINATOR),
    rawAmount,
  };
}

/**
 * Split a fee from `paymentCoin` and transfer it to `receiver` inside the given PTB.
 *
 * **Order is load-bearing.** Call this BEFORE the protocol operation that consumes
 * `paymentCoin` (e.g. NAVI deposit). `splitCoins` mutates the source coin in place,
 * leaving the remainder for the protocol step. If you split AFTER the deposit,
 * the deposit will have consumed the coin and the split will fail.
 *
 * Atomicity: `splitCoins` + `transferObjects` are PTB ops; if anything later in
 * the PTB reverts, the fee transfer reverts too.
 *
 * @param tx          Active PTB
 * @param paymentCoin Coin to split the fee from (mutated in place)
 * @param feeBps      Fee rate in basis points (e.g. `SAVE_FEE_BPS = 10n` = 0.1%)
 * @param receiver    Treasury wallet address (typically `T2000_OVERLAY_FEE_WALLET`)
 * @param amount      Display-units input amount (matches what was passed to the
 *                    protocol operation; used to compute the raw fee amount)
 * @param decimals    Coin decimals for raw conversion. Defaults to USDC_DECIMALS
 *                    (6). Pass the actual coin decimals when skimming a fee
 *                    from a non-USDC coin (e.g. USDsui = 6, GOLD = 6, ETH = 8,
 *                    SUI = 9). Backward-compatible: existing USDC callers can
 *                    omit. Wrong decimals → wrong raw amount → either fee
 *                    too small (silent loss) or too large (PTB revert from
 *                    insufficient coin balance).
 */
export function addFeeTransfer(
  tx: Transaction,
  paymentCoin: TransactionObjectArgument,
  feeBps: bigint,
  receiver: string,
  amount: number,
  decimals: number = USDC_DECIMALS,
): void {
  if (feeBps <= 0n) return;
  if (amount <= 0) return;

  const feeAmount = amount * Number(feeBps) / Number(BPS_DENOMINATOR);
  const rawFee = stableToRaw(feeAmount, decimals);
  if (rawFee <= 0n) return;

  const [feeCoin] = tx.splitCoins(paymentCoin, [tx.pure.u64(rawFee)]);
  tx.transferObjects([feeCoin], tx.pure.address(receiver));
}
