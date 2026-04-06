import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  T2000_PACKAGE_ID,
  T2000_CONFIG_ID,
  T2000_ADMIN_CAP_ID,
  SUPPORTED_ASSETS,
  CLOCK_ID,
  ALLOWANCE_FEATURES,
} from '../constants.js';
import type { AllowanceFeature } from '../constants.js';
import type { AllowanceInfo } from '../types.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;

// ---------------------------------------------------------------------------
// Transaction builders
// ---------------------------------------------------------------------------

/**
 * Build a PTB that creates a new shared Allowance<USDC> for the signer.
 */
export function buildCreateAllowanceTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::create`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(CLOCK_ID)],
  });
  return tx;
}

/**
 * Add an owner deposit call to an existing PTB.
 * The caller must provide a coin reference (e.g. from `tx.splitCoins`).
 */
export function addDepositAllowanceTx(
  tx: Transaction,
  allowanceId: string,
  paymentCoin: TransactionObjectArgument,
): void {
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::deposit`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(allowanceId), paymentCoin],
  });
}

/**
 * Build a standalone deposit PTB that splits `amount` (raw USDC) from
 * the given USDC coin and deposits into the allowance.
 */
export function buildDepositAllowanceTx(
  allowanceId: string,
  usdcCoin: string,
  amount: bigint,
): Transaction {
  const tx = new Transaction();
  const [split] = tx.splitCoins(tx.object(usdcCoin), [tx.pure.u64(amount)]);
  addDepositAllowanceTx(tx, allowanceId, split);
  return tx;
}

/**
 * Build an admin-sponsored deposit PTB. Requires AdminCap in the signer's wallet.
 */
export function buildAdminDepositAllowanceTx(
  allowanceId: string,
  usdcCoin: string,
  amount: bigint,
): Transaction {
  const tx = new Transaction();
  const [split] = tx.splitCoins(tx.object(usdcCoin), [tx.pure.u64(amount)]);
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::admin_deposit`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(allowanceId),
      tx.object(T2000_ADMIN_CAP_ID),
      split,
    ],
  });
  return tx;
}

/**
 * Build a deduct PTB. Only callable by the AdminCap holder (server/cron).
 * Deducted USDC is transferred to the signer (admin wallet).
 */
export function buildDeductAllowanceTx(
  allowanceId: string,
  amount: bigint,
  feature: AllowanceFeature,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::deduct`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(allowanceId),
      tx.object(T2000_CONFIG_ID),
      tx.object(T2000_ADMIN_CAP_ID),
      tx.pure.u64(amount),
      tx.pure.u8(feature),
    ],
  });
  return tx;
}

/**
 * Build a full-withdrawal PTB. Returns entire remaining balance to the owner.
 */
export function buildWithdrawAllowanceTx(allowanceId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::withdraw`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(allowanceId)],
  });
  return tx;
}

/**
 * Build a partial-withdrawal PTB. Returns `amount` (raw USDC) to the owner.
 */
export function buildWithdrawAmountAllowanceTx(
  allowanceId: string,
  amount: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::withdraw_amount`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(allowanceId), tx.pure.u64(amount)],
  });
  return tx;
}

// ---------------------------------------------------------------------------
// Read helpers (on-chain queries)
// ---------------------------------------------------------------------------

interface AllowanceFields {
  id: { id: string };
  owner: string;
  balance: string;
  total_deposited: string;
  total_spent: string;
  created_at: string;
}

/**
 * Fetch the full allowance state from an on-chain Allowance<T> shared object.
 */
export async function getAllowance(
  client: SuiJsonRpcClient,
  allowanceId: string,
): Promise<AllowanceInfo> {
  const obj = await client.getObject({
    id: allowanceId,
    options: { showContent: true, showType: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Allowance ${allowanceId} not found or is not a Move object`);
  }

  const fields = obj.data.content.fields as unknown as AllowanceFields;
  const coinType = extractCoinType(obj.data.content.type);

  return {
    id: allowanceId,
    owner: fields.owner,
    balance: BigInt(fields.balance),
    totalDeposited: BigInt(fields.total_deposited),
    totalSpent: BigInt(fields.total_spent),
    createdAt: Number(fields.created_at),
    coinType,
  };
}

/**
 * Shorthand: get just the USDC balance of an allowance.
 */
export async function getAllowanceBalance(
  client: SuiJsonRpcClient,
  allowanceId: string,
): Promise<bigint> {
  const info = await getAllowance(client, allowanceId);
  return info.balance;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function extractCoinType(objectType: string): string {
  const match = objectType.match(/<(.+)>/);
  return match ? match[1] : 'unknown';
}

export { ALLOWANCE_FEATURES };
export type { AllowanceFeature };
