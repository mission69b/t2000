import { Transaction } from '@mysten/sui/transactions';
import { getGasStationWallet, getSuiClient } from '../lib/wallets.js';
import { enqueueSign } from '../lib/signingQueue.js';
import {
  isCircuitBreakerTripped,
  exceedsGasFeeCeiling,
  gasCostToUsd,
  GAS_FEE_CEILING,
} from '../lib/priceCache.js';
import { prisma } from '../db/prisma.js';

const BOOTSTRAP_LIMIT = 10;
const MIN_POOL_BALANCE = 100_000_000_000n; // 100 SUI

export type GasRequestType = 'bootstrap' | 'auto-topup' | 'fallback';

export interface GasSponsorResult {
  txBytes: string;
  sponsorSignature: string;
  gasEstimateUsd: number;
  type: GasRequestType;
}

export async function getBootstrapCount(agentAddress: string): Promise<number> {
  return prisma.gasLedger.count({
    where: { agentAddress, txType: 'bootstrap' },
  });
}

async function checkPoolBalance(): Promise<boolean> {
  const client = getSuiClient();
  const gasWallet = getGasStationWallet();
  const address = gasWallet.getPublicKey().toSuiAddress();
  const balance = await client.getBalance({ owner: address });
  return BigInt(balance.totalBalance) >= MIN_POOL_BALANCE;
}

async function determineGasType(agentAddress: string): Promise<GasRequestType> {
  const bootstrapCount = await getBootstrapCount(agentAddress);
  if (bootstrapCount < BOOTSTRAP_LIMIT) return 'bootstrap';
  return 'fallback';
}

export async function sponsorTransaction(
  txBytesBase64: string,
  senderAddress: string,
  requestType?: GasRequestType,
): Promise<GasSponsorResult> {
  if (isCircuitBreakerTripped()) {
    throw new Error('CIRCUIT_BREAKER: SUI price unstable — sponsorship paused');
  }

  const poolOk = await checkPoolBalance();
  if (!poolOk) {
    throw new Error('POOL_DEPLETED: Gas station balance below minimum reserve');
  }

  const type = requestType ?? await determineGasType(senderAddress);

  return enqueueSign(async () => {
    const client = getSuiClient();
    const gasKeypair = getGasStationWallet();
    const gasAddress = gasKeypair.getPublicKey().toSuiAddress();

    // Reconstruct the transaction from JSON (base64-encoded JSON string)
    const txJson = Buffer.from(txBytesBase64, 'base64').toString('utf-8');
    const tx = Transaction.from(txJson);
    tx.setSender(senderAddress);
    tx.setGasOwner(gasAddress);

    // Build the transaction to get gas estimate
    const builtBytes = await tx.build({ client });

    // Estimate gas cost — dry run
    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: Buffer.from(builtBytes).toString('base64'),
    });

    const gasUsed = dryRun.effects?.gasUsed;
    let gasCostSui = 0;
    if (gasUsed) {
      gasCostSui = (
        Number(gasUsed.computationCost) +
        Number(gasUsed.storageCost) -
        Number(gasUsed.storageRebate)
      ) / 1e9;
    }

    // Check fee ceiling for non-bootstrap requests
    if (type === 'fallback' && exceedsGasFeeCeiling(gasCostSui)) {
      throw new Error(`GAS_FEE_EXCEEDED: Gas cost $${gasCostToUsd(gasCostSui).toFixed(4)} exceeds $${GAS_FEE_CEILING} ceiling`);
    }

    // Sponsor signs the transaction
    const { signature } = await gasKeypair.signTransaction(builtBytes);

    return {
      txBytes: Buffer.from(builtBytes).toString('base64'),
      sponsorSignature: signature,
      gasEstimateUsd: gasCostToUsd(gasCostSui),
      type,
    };
  });
}

export async function recordGasSponsorship(
  agentAddress: string,
  txDigest: string,
  gasCostSui: number,
  usdcCharged: number,
  type: GasRequestType,
): Promise<void> {
  await prisma.gasLedger.create({
    data: {
      agentAddress,
      suiSpent: gasCostSui.toString(),
      usdcCharged: usdcCharged.toString(),
      txDigest,
      txType: type,
      status: type === 'bootstrap' ? 'loss' : 'settled',
    },
  });
}
