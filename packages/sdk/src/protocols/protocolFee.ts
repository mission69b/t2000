import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import {
  SAVE_FEE_BPS,
  SWAP_FEE_BPS,
  BORROW_FEE_BPS,
  BPS_DENOMINATOR,
  SUPPORTED_ASSETS,
  T2000_TREASURY_ID,
  API_BASE_URL,
} from '../constants.js';
import { usdcToRaw } from '../utils/format.js';

export type FeeOperation = 'save' | 'swap' | 'borrow';

export interface ProtocolFeeInfo {
  amount: number;
  asset: string;
  rate: number; // as percentage, e.g. 0.1
  rawAmount: bigint;
}

const FEE_RATES: Record<FeeOperation, bigint> = {
  save: SAVE_FEE_BPS,
  swap: SWAP_FEE_BPS,
  borrow: BORROW_FEE_BPS,
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
 * Add protocol fee collection to an existing PTB.
 * Splits the fee from the agent's USDC coins and sends to the treasury.
 * Returns the fee coin for inclusion in the atomic transaction.
 */
export async function addFeeToTransaction(
  tx: Transaction,
  client: SuiClient,
  senderAddress: string,
  operation: FeeOperation,
  amount: number,
): Promise<ProtocolFeeInfo> {
  const fee = calculateFee(operation, amount);

  if (fee.rawAmount <= 0n) return fee;

  const coins = await client.getCoins({
    owner: senderAddress,
    coinType: SUPPORTED_ASSETS.USDC.type,
  });

  if (coins.data.length === 0) return fee;

  const primary = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
  }

  const [feeCoin] = tx.splitCoins(primary, [fee.rawAmount]);

  // Transfer fee directly to treasury
  tx.transferObjects([feeCoin], T2000_TREASURY_ID);

  return fee;
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
