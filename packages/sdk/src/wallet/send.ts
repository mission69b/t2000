import {
  Transaction,
  coinWithBalance,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SUPPORTED_ASSETS, type SupportedAsset } from '../constants.js';
import { T2000Error } from '../errors.js';
import { validateAddress } from '../utils/sui.js';
import { displayToRaw } from '../utils/format.js';

export async function buildSendTx({
  client,
  address,
  to,
  amount,
  asset = 'USDC',
}: { client: SuiJsonRpcClient; address: string; to: string; amount: number; asset?: SupportedAsset }): Promise<Transaction> {
  const recipient = validateAddress(to);
  const assetInfo = SUPPORTED_ASSETS[asset];

  if (!assetInfo) throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
  if (amount <= 0) throw new T2000Error('INVALID_AMOUNT', 'Amount must be greater than zero');

  const rawAmount = displayToRaw(amount, assetInfo.decimals);
  const tx = new Transaction();
  tx.setSender(address);

  // Pre-flight against `getBalance().totalBalance` (sums coins + address
  // balance) — the legacy `getCoins` page miss broke for users whose
  // stables had drifted into address balance via @suimpp/mpp 0.7+ payments.
  const balanceResp = await client.getBalance({ owner: address, coinType: assetInfo.type });
  const totalBalance = BigInt(balanceResp.totalBalance);
  if (totalBalance < rawAmount) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`, {
      available: Number(totalBalance) / 10 ** assetInfo.decimals,
      required: amount,
    });
  }

  // For SUI use the gas coin (`useGasCoin: true`, the default). For every
  // other asset use coinWithBalance, which auto-resolves coin objects +
  // address balance at build time.
  const sendCoin =
    asset === 'SUI'
      ? tx.splitCoins(tx.gas, [rawAmount])[0]
      : coinWithBalance({ type: assetInfo.type, balance: rawAmount })(tx);

  tx.transferObjects([sendCoin], recipient);

  return tx;
}

/**
 * Fragment-appender for the chain-mode send leg of SPEC 7 multi-write
 * Payment Intents. Consumes a coin reference produced by a previous
 * appender (e.g. `addWithdrawToTx`, `addSwapToTx`) and transfers it to
 * `recipient` within the same Payment Intent — no intermediate wallet
 * materialization.
 *
 * Codifies the hand-built send leg from
 * `scripts/smoke-spec7-withdraw-then-send.ts` (P2.1) into a typed
 * appender. SPEC 7 § "Layer 1" — P2.2b will register this in the
 * `WRITE_APPENDER_REGISTRY` under `send_transfer` for chain-mode
 * dispatch; the registry adapter will handle the wallet-fetch fallback
 * by delegating to `buildSendTx` when no upstream coin is available.
 *
 * For single-step send_transfer flows (no chained predecessor), use
 * `buildSendTx` directly — it builds a complete tx including the
 * wallet-coin selection / merge / split prelude.
 *
 * @returns void — the coin is consumed by `tx.transferObjects`. Callers
 *   that need the post-transfer "effective amount" should rely on the
 *   upstream appender's `effectiveAmount` (e.g. `addWithdrawToTx`'s
 *   return), not on this appender.
 */
export function addSendToTx(
  tx: Transaction,
  coin: TransactionObjectArgument,
  recipient: string,
): void {
  const validRecipient = validateAddress(recipient);
  tx.transferObjects([coin], validRecipient);
}

