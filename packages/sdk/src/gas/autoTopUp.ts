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

const AUTO_TOPUP_MIN_SUI_FOR_GAS = 5_000_000n; // 0.005 SUI — minimum to self-fund the swap

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

  return suiRaw < AUTO_TOPUP_THRESHOLD && suiRaw >= AUTO_TOPUP_MIN_SUI_FOR_GAS && usdcRaw >= AUTO_TOPUP_MIN_USDC;
}

/**
 * Self-fund a USDC→SUI swap to replenish gas.
 *
 * Uses the agent's remaining SUI to pay for the swap gas (~0.007 SUI).
 * This avoids the chicken-and-egg problem of needing gas station sponsorship
 * to get gas, and works even when the gas station is down.
 */
export async function executeAutoTopUp(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
): Promise<AutoTopUpResult> {
  const address = keypair.getPublicKey().toSuiAddress();
  const topupAmountHuman = Number(AUTO_TOPUP_AMOUNT) / 1e6; // $1 USDC

  const { tx } = await buildSwapTx({
    client,
    address,
    fromAsset: 'USDC',
    toAsset: 'SUI',
    amount: topupAmountHuman,
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
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

  return {
    success: true,
    tx: result.digest,
    usdcSpent: topupAmountHuman,
    suiReceived: Math.abs(suiReceived),
  };
}
