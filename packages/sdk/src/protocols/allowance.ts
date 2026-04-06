import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  T2000_PACKAGE_ID,
  T2000_CONFIG_ID,
  T2000_ADMIN_CAP_ID,
  SUPPORTED_ASSETS,
  CLOCK_ID,
  ALLOWANCE_FEATURES,
  FEATURES_ALL,
} from '../constants.js';
import type { AllowanceFeature } from '../constants.js';
import type { AllowanceInfo } from '../types.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;

// ---------------------------------------------------------------------------
// Transaction builders
// ---------------------------------------------------------------------------

export interface CreateAllowanceOptions {
  permittedFeatures?: bigint;
  expiresAt?: bigint;
  dailyLimit?: bigint;
}

/**
 * Build a PTB that creates a new shared Allowance<USDC> for the signer.
 */
export function buildCreateAllowanceTx(options: CreateAllowanceOptions = {}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::create`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.pure.u64(options.permittedFeatures ?? BigInt(FEATURES_ALL)),
      tx.pure.u64(options.expiresAt ?? 0n),
      tx.pure.u64(options.dailyLimit ?? 0n),
      tx.object(CLOCK_ID),
    ],
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
 * Enforces on-chain: feature permission, expiry, daily limit.
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
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Build an update_scope PTB. Owner updates permitted features, expiry, and daily limit.
 */
export function buildUpdateScopeTx(
  allowanceId: string,
  permittedFeatures: bigint,
  expiresAt: bigint,
  dailyLimit: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${T2000_PACKAGE_ID}::allowance::update_scope`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(allowanceId),
      tx.pure.u64(permittedFeatures),
      tx.pure.u64(expiresAt),
      tx.pure.u64(dailyLimit),
      tx.object(CLOCK_ID),
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
  permitted_features: string;
  expires_at: string;
  daily_limit: string;
  daily_spent: string;
  window_start: string;
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
    balance: parseU64Field(fields.balance),
    totalDeposited: parseU64Field(fields.total_deposited),
    totalSpent: parseU64Field(fields.total_spent),
    createdAt: Number(fields.created_at),
    coinType,
    permittedFeatures: parseU64Field(fields.permitted_features),
    expiresAt: Number(fields.expires_at),
    dailyLimit: parseU64Field(fields.daily_limit),
    dailySpent: parseU64Field(fields.daily_spent),
    windowStart: Number(fields.window_start),
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

/**
 * Sui RPC usually flattens Balance<T> to its inner u64 string, but some
 * edge cases return `{ value: "..." }`. Handle both.
 */
function parseU64Field(raw: unknown): bigint {
  if (typeof raw === 'string' || typeof raw === 'number') return BigInt(raw);
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return BigInt((raw as { value: string }).value);
  }
  return 0n;
}

function extractCoinType(objectType: string): string {
  const match = objectType.match(/<(.+)>/);
  return match ? match[1] : 'unknown';
}

export { ALLOWANCE_FEATURES, FEATURES_ALL };
export type { AllowanceFeature };
