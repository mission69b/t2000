import { Method, Credential } from 'mppx';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { suiCharge } from './method.js';
import { fetchCoins, parseAmountToRaw } from './utils.js';

export { suiCharge } from './method.js';
export { SUI_USDC_TYPE } from './utils.js';

export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
}

export interface SuiChargeOptions {
  client: SuiJsonRpcClient;
  signer: TransactionSigner;
  /** Override transaction execution (e.g. to route through a gas manager). */
  execute?: (tx: Transaction) => Promise<{ digest: string; effects: unknown }>;
}

export function sui(options: SuiChargeOptions) {
  const address = options.signer.getAddress();

  return Method.toClient(suiCharge, {
    async createCredential({ challenge }) {
      const { amount, currency, recipient } = challenge.request;
      const amountRaw = parseAmountToRaw(amount, 6);

      const coins = await fetchCoins(options.client, address, currency);
      if (coins.length === 0) {
        throw new Error(
          `No ${currency.split('::').pop()} balance to pay with`,
        );
      }

      const totalBalance = coins.reduce(
        (sum, c) => sum + BigInt(c.balance),
        0n,
      );
      if (totalBalance < amountRaw) {
        const available = Number(totalBalance) / 1e6;
        const requested = Number(amountRaw) / 1e6;
        throw new Error(
          `Not enough USDC to pay $${requested.toFixed(2)} (available: $${available.toFixed(2)})`,
        );
      }

      const tx = new Transaction();
      tx.setSender(address);

      const primaryCoin = tx.object(coins[0].coinObjectId);
      if (coins.length > 1) {
        tx.mergeCoins(
          primaryCoin,
          coins.slice(1).map((c) => tx.object(c.coinObjectId)),
        );
      }

      const [payment] = tx.splitCoins(primaryCoin, [amountRaw]);
      tx.transferObjects([payment], recipient);

      let result;
      try {
        if (options.execute) {
          result = await options.execute(tx);
        } else {
          tx.setSender(address);
          const built = await tx.build({ client: options.client });
          const { signature } = await options.signer.signTransaction(built);
          result = await options.client.executeTransactionBlock({
            transactionBlock: built,
            signature,
            options: { showEffects: true },
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Payment transaction failed: ${msg}`);
      }

      return Credential.serialize({
        challenge,
        payload: { digest: result.digest },
      });
    },
  });
}
