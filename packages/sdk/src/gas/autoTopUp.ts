import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  SUPPORTED_ASSETS,
  AUTO_TOPUP_THRESHOLD,
  AUTO_TOPUP_AMOUNT,
  AUTO_TOPUP_MIN_USDC,
  MIST_PER_SUI,
} from '../constants.js';
import { buildSwapTx } from '../protocols/cetus.js';
import { requestGasSponsorship, reportGasUsage } from './gasStation.js';

export interface AutoTopUpResult {
  success: boolean;
  tx: string;
  usdcSpent: number;
  suiReceived: number;
}

export async function shouldAutoTopUp(
  client: SuiJsonRpcClient,
  address: string,
): Promise<boolean> {
  const [suiBalance, usdcBalance] = await Promise.all([
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.USDC.type }),
  ]);

  const suiRaw = BigInt(suiBalance.totalBalance);
  const usdcRaw = BigInt(usdcBalance.totalBalance);

  return suiRaw < AUTO_TOPUP_THRESHOLD && usdcRaw >= AUTO_TOPUP_MIN_USDC;
}

/**
 * Swap USDC→SUI to replenish gas. Tries self-funding first; if the agent
 * doesn't have enough SUI to pay for the swap itself, falls back to
 * gas station sponsorship — eliminating the chicken-and-egg problem.
 */
export async function executeAutoTopUp(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
): Promise<AutoTopUpResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const topupAmountHuman = Number(AUTO_TOPUP_AMOUNT) / 1e6;

  const { tx } = await buildSwapTx({
    client,
    address,
    fromAsset: 'USDC',
    toAsset: 'SUI',
    amount: topupAmountHuman,
  });
  tx.setSender(address);

  let result;
  try {
    result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showBalanceChanges: true },
    });
  } catch {
    // Not enough SUI to self-fund the swap — sponsor it via gas station
    const { tx: freshTx } = await buildSwapTx({
      client, address, fromAsset: 'USDC', toAsset: 'SUI', amount: topupAmountHuman,
    });
    freshTx.setSender(address);

    let txJson: string | undefined;
    let txBcsBase64: string | undefined;
    try {
      txJson = freshTx.serialize();
    } catch {
      const bcsBytes = await freshTx.build({ client });
      txBcsBase64 = Buffer.from(bcsBytes).toString('base64');
    }

    const sponsored = await requestGasSponsorship(
      txJson ?? '', address, 'auto-topup', txBcsBase64,
    );
    const sponsoredTxBytes = Buffer.from(sponsored.txBytes, 'base64');
    const { signature: agentSig } = await keypair.signTransaction(sponsoredTxBytes);

    result = await client.executeTransactionBlock({
      transactionBlock: sponsored.txBytes,
      signature: [agentSig, sponsored.sponsorSignature],
      options: { showEffects: true, showBalanceChanges: true },
    });
    reportGasUsage(address, result.digest, 0, 0, 'auto-topup');
  }

  await client.waitForTransaction({ digest: result.digest });

  let suiReceived = 0;
  if (result.balanceChanges) {
    for (const change of result.balanceChanges) {
      if (
        change.coinType === SUPPORTED_ASSETS.SUI.type &&
        change.owner &&
        typeof change.owner === 'object' &&
        'AddressOwner' in change.owner &&
        change.owner.AddressOwner === address
      ) {
        suiReceived += Number(change.amount) / Number(MIST_PER_SUI);
      }
    }
  }

  return {
    success: true,
    tx: result.digest,
    usdcSpent: topupAmountHuman,
    suiReceived: Math.abs(suiReceived),
  };
}
