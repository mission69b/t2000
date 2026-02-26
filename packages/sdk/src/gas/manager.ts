import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import {
  SUPPORTED_ASSETS,
  AUTO_TOPUP_THRESHOLD,
  MIST_PER_SUI,
} from '../constants.js';
import type { GasMethod } from '../types.js';
import { T2000Error } from '../errors.js';
import { shouldAutoTopUp, executeAutoTopUp } from './autoTopUp.js';
import { requestGasSponsorship, reportGasUsage } from './gasStation.js';

export interface GasExecutionResult {
  digest: string;
  effects: unknown;
  gasMethod: GasMethod;
  gasCostSui: number;
}

function extractGasCost(
  effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | undefined | null,
): number {
  if (!effects?.gasUsed) return 0;
  return (
    Number(effects.gasUsed.computationCost) +
    Number(effects.gasUsed.storageCost) -
    Number(effects.gasUsed.storageRebate)
  ) / 1e9;
}

async function getSuiBalance(client: SuiClient, address: string): Promise<bigint> {
  const bal = await client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type });
  return BigInt(bal.totalBalance);
}

async function trySelfFunded(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<GasExecutionResult | null> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suiBalance = await getSuiBalance(client, address);

  // Need at least 0.05 SUI for gas
  if (suiBalance < AUTO_TOPUP_THRESHOLD) return null;

  tx.setSender(address);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  return {
    digest: result.digest,
    effects: result.effects,
    gasMethod: 'self-funded',
    gasCostSui: extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]),
  };
}

async function tryAutoTopUpThenSelfFund(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<GasExecutionResult | null> {
  const address = keypair.getPublicKey().toSuiAddress();

  const canTopUp = await shouldAutoTopUp(client, address);
  if (!canTopUp) return null;

  try {
    await executeAutoTopUp(client, keypair);
  } catch {
    return null;
  }

  // After top-up, try self-funded again
  tx.setSender(address);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  return {
    digest: result.digest,
    effects: result.effects,
    gasMethod: 'auto-topup',
    gasCostSui: extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]),
  };
}

async function trySponsored(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<GasExecutionResult | null> {
  const address = keypair.getPublicKey().toSuiAddress();
  tx.setSender(address);

  let txBytes: Uint8Array;
  try {
    txBytes = await tx.build({ client, onlyTransactionKind: true });
  } catch {
    return null;
  }

  const txBytesBase64 = Buffer.from(txBytes).toString('base64');

  let sponsoredResult;
  try {
    sponsoredResult = await requestGasSponsorship(txBytesBase64, address);
  } catch {
    return null;
  }

  const sponsoredTxBytes = Buffer.from(sponsoredResult.txBytes, 'base64');
  const { signature: agentSig } = await keypair.signTransaction(sponsoredTxBytes);

  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredResult.txBytes,
    signature: [agentSig, sponsoredResult.sponsorSignature],
    options: { showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  // Report gas usage (best-effort)
  const gasCost = extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]);
  reportGasUsage(address, result.digest, gasCost, 0, sponsoredResult.type);

  return {
    digest: result.digest,
    effects: result.effects,
    gasMethod: 'sponsored',
    gasCostSui: gasCost,
  };
}

/**
 * Gas resolution chain:
 * 1. Self-funded (agent has enough SUI)
 * 2. Auto-topup (swap USDC→SUI, then self-fund)
 * 3. Gas Station sponsored (fallback)
 * 4. Fail with INSUFFICIENT_GAS
 */
export async function executeWithGas(
  client: SuiClient,
  keypair: Ed25519Keypair,
  buildTx: () => Transaction | Promise<Transaction>,
): Promise<GasExecutionResult> {
  const errors: string[] = [];

  // Step 1: Try self-funded
  try {
    const tx = await buildTx();
    const result = await trySelfFunded(client, keypair, tx);
    if (result) return result;
    errors.push('self-funded: SUI below threshold');
  } catch (err) {
    errors.push(`self-funded: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Try auto-topup then self-fund
  try {
    const tx = await buildTx();
    const result = await tryAutoTopUpThenSelfFund(client, keypair, tx);
    if (result) return result;
    errors.push('auto-topup: not eligible (low USDC or sufficient SUI)');
  } catch (err) {
    errors.push(`auto-topup: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 3: Try gas station sponsored
  try {
    const tx = await buildTx();
    const result = await trySponsored(client, keypair, tx);
    if (result) return result;
    errors.push('sponsored: returned null');
  } catch (err) {
    errors.push(`sponsored: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 4: All methods failed
  throw new T2000Error(
    'INSUFFICIENT_GAS',
    `No SUI for gas and Gas Station unavailable. Fund your wallet with SUI or USDC. [${errors.join(' | ')}]`,
    { reason: 'all_gas_methods_exhausted', errors },
  );
}
