import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  SUPPORTED_ASSETS,
  GAS_RESERVE_TARGET,
  AUTO_TOPUP_AMOUNT,
  AUTO_TOPUP_MIN_USDC,
  MIST_PER_SUI,
} from '../constants.js';
import { buildSwapTx } from '../protocols/cetus.js';
import { requestGasSponsorship, reportGasUsage } from './gasStation.js';
import { T2000Error } from '../errors.js';
import type { TransactionSigner } from '../signer.js';
import { toBase64, fromBase64 } from '../utils/base64.js';

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

  return suiRaw < GAS_RESERVE_TARGET && usdcRaw >= AUTO_TOPUP_MIN_USDC;
}

/**
 * Swap USDC→SUI to replenish gas. Tries self-funding first; if the agent
 * doesn't have enough SUI to pay for the swap itself, falls back to
 * gas station sponsorship — eliminating the chicken-and-egg problem.
 */
export async function executeAutoTopUp(
  client: SuiJsonRpcClient,
  signer: TransactionSigner,
): Promise<AutoTopUpResult> {
  const address = signer.getAddress();
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
    const builtBytes = await tx.build({ client });
    const { signature } = await signer.signTransaction(builtBytes);
    result = await client.executeTransactionBlock({
      transactionBlock: toBase64(builtBytes),
      signature: [signature],
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
      txBcsBase64 = toBase64(bcsBytes);
    }

    const sponsored = await requestGasSponsorship(
      txJson ?? '', address, 'auto-topup', txBcsBase64,
    );
    const sponsoredTxBytes = fromBase64(sponsored.txBytes);
    const { signature: agentSig } = await signer.signTransaction(sponsoredTxBytes);

    result = await client.executeTransactionBlock({
      transactionBlock: sponsored.txBytes,
      signature: [agentSig, sponsored.sponsorSignature],
      options: { showEffects: true, showBalanceChanges: true },
    });
    reportGasUsage(address, result.digest, 0, 0, 'auto-topup');
  }

  await client.waitForTransaction({ digest: result.digest });

  const eff = result.effects as { status?: { status: string; error?: string } } | undefined;
  if (eff?.status?.status === 'failure') {
    throw new T2000Error(
      'TRANSACTION_FAILED',
      `Auto-topup swap failed on-chain: ${eff.status.error ?? 'unknown'}`,
    );
  }

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
