import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { usdcToRaw } from '@t2000/sdk';
import {
  PAYMENT_KIT_PACKAGE,
  PAYMENT_KIT_MODULE,
  PAYMENT_KIT_FUNCTION,
  T2000_PAYMENT_REGISTRY_ID,
  USDC_TYPE,
  CLOCK_ID,
} from './constants.js';

export interface PaymentPTBParams {
  nonce: string;
  amount: string;
  payTo: string;
}

/**
 * Builds a payment PTB using USDC coins from the wallet.
 *
 * The Move function signature:
 *   process_registry_payment<CoinType>(
 *     registry: &mut PaymentRegistry<CoinType>,
 *     nonce: String,
 *     amount: u64,
 *     coin: Coin<CoinType>,
 *     receiver: Option<address>,
 *     clock: &Clock
 *   )
 *
 * Move enforces nonce uniqueness atomically via EDuplicatePayment.
 */
export async function buildPaymentTransaction(
  client: SuiJsonRpcClient,
  senderAddress: string,
  params: PaymentPTBParams,
): Promise<Transaction> {
  const { nonce, amount, payTo } = params;
  const rawAmount = usdcToRaw(Number(amount));

  if (!T2000_PAYMENT_REGISTRY_ID) {
    throw new Error(
      'T2000_PAYMENT_REGISTRY_ID is not set. ' +
      'Create a PaymentRegistry<USDC> via Payment Kit before using x402.'
    );
  }

  const coins = await client.getCoins({
    owner: senderAddress,
    coinType: USDC_TYPE,
  });

  if (coins.data.length === 0) {
    throw new Error('No USDC coins found in wallet');
  }

  const tx = new Transaction();

  let primaryCoin = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    const otherCoins = coins.data.slice(1).map(c => tx.object(c.coinObjectId));
    tx.mergeCoins(primaryCoin, otherCoins);
  }

  const [paymentCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(rawAmount)]);

  tx.moveCall({
    target: `${PAYMENT_KIT_PACKAGE}::${PAYMENT_KIT_MODULE}::${PAYMENT_KIT_FUNCTION}`,
    arguments: [
      tx.object(T2000_PAYMENT_REGISTRY_ID),
      tx.pure.string(nonce),
      tx.pure.u64(rawAmount),
      paymentCoin,
      tx.pure.option('address', payTo),
      tx.object(CLOCK_ID),
    ],
    typeArguments: [USDC_TYPE],
  });

  return tx;
}
