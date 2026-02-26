import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  SUPPORTED_ASSETS,
  AUTO_TOPUP_THRESHOLD,
  AUTO_TOPUP_AMOUNT,
  AUTO_TOPUP_MIN_USDC,
  MIST_PER_SUI,
} from '../constants.js';
import { T2000Error } from '../errors.js';
import { buildSwapTx } from '../protocols/cetus.js';
import { requestGasSponsorship, reportGasUsage } from './gasStation.js';

export interface AutoTopUpResult {
  success: boolean;
  tx: string;
  usdcSpent: number;
  suiReceived: number;
}

export async function shouldAutoTopUp(
  client: SuiClient,
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

export async function executeAutoTopUp(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<AutoTopUpResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const topupAmountHuman = Number(AUTO_TOPUP_AMOUNT) / 1e6; // $1 USDC

  // Build swap tx via Cetus SDK (handles package upgrades automatically)
  const { tx } = await buildSwapTx({
    client,
    address,
    fromAsset: 'USDC',
    toAsset: 'SUI',
    amount: topupAmountHuman,
  });

  // Serialize for gas station sponsorship (auto-topup gas is always sponsored)
  const txBytes = await tx.build({ client, onlyTransactionKind: true });
  const txBytesBase64 = Buffer.from(txBytes).toString('base64');

  const sponsoredResult = await requestGasSponsorship(txBytesBase64, address, 'auto-topup');

  // Sign with agent key and submit
  const sponsoredTxBytes = Buffer.from(sponsoredResult.txBytes, 'base64');
  const { signature: agentSig } = await keypair.signTransaction(sponsoredTxBytes);

  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredResult.txBytes,
    signature: [agentSig, sponsoredResult.sponsorSignature],
    options: { showEffects: true, showBalanceChanges: true },
  });

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

  reportGasUsage(address, result.digest, 0, 0, 'auto-topup');

  return {
    success: true,
    tx: result.digest,
    usdcSpent: topupAmountHuman,
    suiReceived: Math.abs(suiReceived),
  };
}
