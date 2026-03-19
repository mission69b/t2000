import { Method, Receipt } from 'mppx';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { suiCharge } from './method.js';
import { parseAmountToRaw } from './utils.js';

export { suiCharge } from './method.js';
export { SUI_USDC_TYPE } from './utils.js';

export interface SuiServerOptions {
  currency: string;
  recipient: string;
  rpcUrl?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
}

export function sui(options: SuiServerOptions) {
  const network = options.network ?? 'mainnet';
  const client = new SuiJsonRpcClient({
    url: options.rpcUrl ?? getJsonRpcFullnodeUrl(network),
    network,
  });

  const normalizedRecipient = normalizeSuiAddress(options.recipient);

  return Method.toServer(suiCharge, {
    defaults: {
      currency: options.currency,
      recipient: options.recipient,
    },

    async verify({ credential }) {
      const digest = credential.payload.digest;

      let tx: Awaited<ReturnType<typeof client.getTransactionBlock>> | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          tx = await client.getTransactionBlock({
            digest,
            options: { showEffects: true, showBalanceChanges: true },
          });
          break;
        } catch {
          if (attempt === 4) throw new Error(`Could not find the referenced transaction [${digest}]`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      if (!tx) throw new Error(`Could not find the referenced transaction [${digest}]`);

      if (tx.effects?.status?.status !== 'success') {
        throw new Error('Transaction failed on-chain');
      }

      const payment = (tx.balanceChanges ?? []).find(
        (bc: { coinType: string; owner: unknown; amount: string }) =>
          bc.coinType === options.currency &&
          typeof bc.owner === 'object' &&
          bc.owner !== null &&
          'AddressOwner' in bc.owner &&
          normalizeSuiAddress((bc.owner as { AddressOwner: string }).AddressOwner) === normalizedRecipient &&
          Number(bc.amount) > 0,
      );

      if (!payment) {
        throw new Error(
          'Payment not found in transaction balance changes',
        );
      }

      const transferredRaw = BigInt(payment.amount);
      const requestedRaw = parseAmountToRaw(credential.challenge.request.amount, 6);
      if (transferredRaw < requestedRaw) {
        throw new Error(
          `Transferred ${transferredRaw} < requested ${requestedRaw} (raw units)`,
        );
      }

      return Receipt.from({
        method: 'sui',
        reference: credential.payload.digest,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    },
  });
}
