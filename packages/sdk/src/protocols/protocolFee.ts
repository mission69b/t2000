import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  SAVE_FEE_BPS,
  BORROW_FEE_BPS,
  BPS_DENOMINATOR,
  SUPPORTED_ASSETS,
  T2000_PACKAGE_ID,
  T2000_TREASURY_ID,
  T2000_CONFIG_ID,
  API_BASE_URL,
} from '../constants.js';
import { usdcToRaw } from '../utils/format.js';

export type FeeOperation = 'save' | 'borrow';

export interface ProtocolFeeInfo {
  amount: number;
  asset: string;
  rate: number;
  rawAmount: bigint;
}

const FEE_RATES: Record<FeeOperation, bigint> = {
  save: SAVE_FEE_BPS,
  borrow: BORROW_FEE_BPS,
};

const OP_CODES: Record<FeeOperation, number> = {
  save: 0,
  borrow: 2,
};

export function calculateFee(operation: FeeOperation, amount: number): ProtocolFeeInfo {
  const bps = FEE_RATES[operation];
  const feeAmount = amount * Number(bps) / Number(BPS_DENOMINATOR);
  const rawAmount = usdcToRaw(feeAmount);

  return {
    amount: feeAmount,
    asset: 'USDC',
    rate: Number(bps) / Number(BPS_DENOMINATOR),
    rawAmount,
  };
}

/**
 * Add on-chain fee collection to an existing PTB via t2000::treasury::collect_fee().
 * The Move function splits the fee from the payment coin and stores it in the
 * Treasury's internal Balance<T>. Atomic — reverts with the operation if it fails.
 */
export function addCollectFeeToTx(
  tx: Transaction,
  paymentCoin: TransactionObjectArgument,
  operation: FeeOperation,
): void {
  const bps = FEE_RATES[operation];
  if (bps <= 0n) return;

  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::treasury::collect_fee`,
    typeArguments: [SUPPORTED_ASSETS.USDC.type],
    arguments: [
      tx.object(T2000_TREASURY_ID),
      tx.object(T2000_CONFIG_ID),
      paymentCoin,
      tx.pure.u8(OP_CODES[operation]),
    ],
  });
}

export async function reportFee(
  agentAddress: string,
  operation: string,
  feeAmount: number,
  feeRate: number,
  txDigest: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/fees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentAddress,
        operation,
        feeAmount: feeAmount.toString(),
        feeRate: feeRate.toString(),
        txDigest,
      }),
    });
  } catch {
    // Non-critical — best-effort reporting
  }
}
