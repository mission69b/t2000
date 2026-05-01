import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
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

  if (asset === 'SUI') {
    const [coin] = tx.splitCoins(tx.gas, [rawAmount]);
    tx.transferObjects([coin], recipient);
  } else {
    const coins = await client.getCoins({ owner: address, coinType: assetInfo.type });
    if (coins.data.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${asset} coins found`);

    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (totalBalance < rawAmount) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`, {
        available: Number(totalBalance) / 10 ** assetInfo.decimals, required: amount,
      });
    }

    const primaryCoin = tx.object(coins.data[0].coinObjectId);
    if (coins.data.length > 1) {
      tx.mergeCoins(primaryCoin, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [sendCoin] = tx.splitCoins(primaryCoin, [rawAmount]);
    tx.transferObjects([sendCoin], recipient);
  }

  return tx;
}

/**
 * Fragment-appender for the chain-mode send leg of SPEC 7 multi-write
 * PTBs. Consumes a coin reference produced by a previous appender (e.g.
 * `addWithdrawToTx`, `addSwapToTx`) and transfers it to `recipient`
 * within the same PTB — no intermediate wallet materialization.
 *
 * Codifies the hand-built send leg from
 * `scripts/smoke-spec7-withdraw-then-send.ts` (P2.1) into a typed
 * appender. SPEC 7 § "Layer 1" registers this in the
 * `WRITE_APPENDER_REGISTRY` (P2.2b) under `send_transfer` for chain-mode
 * dispatch; the registry adapter handles wallet-fetch fallback by
 * delegating to `buildSendTx` when no upstream coin is available.
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

