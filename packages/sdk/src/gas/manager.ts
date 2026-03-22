import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import {
  SUPPORTED_ASSETS,
  AUTO_TOPUP_THRESHOLD,
  GAS_RESERVE_TARGET,
  AUTO_TOPUP_MIN_USDC,
  MIST_PER_SUI,
} from '../constants.js';
import type { GasMethod } from '../types.js';
import { T2000Error, isMoveAbort, parseMoveAbortMessage } from '../errors.js';
import { shouldAutoTopUp, executeAutoTopUp } from './autoTopUp.js';
import { requestGasSponsorship, reportGasUsage } from './gasStation.js';
import type { SafeguardEnforcer } from '../safeguards/enforcer.js';
import type { TxMetadata } from '../safeguards/types.js';

export interface GasExecutionResult {
  digest: string;
  effects: unknown;
  gasMethod: GasMethod;
  gasCostSui: number;
  /** Pre-TX SUI balance in MIST — used internally for proactive gas maintenance. */
  preTxSuiMist?: bigint;
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

async function getSuiBalance(client: SuiJsonRpcClient, address: string): Promise<bigint> {
  const bal = await client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type });
  return BigInt(bal.totalBalance);
}

async function assertTxSuccess(effects: unknown, digest: string): Promise<void> {
  const eff = effects as { status?: { status: string; error?: string } } | undefined;
  if (eff?.status?.status === 'failure') {
    const errMsg = eff.status.error ?? 'unknown on-chain error';
    if (isMoveAbort(errMsg)) {
      throw new T2000Error('TRANSACTION_FAILED', parseMoveAbortMessage(errMsg));
    }
    throw new T2000Error('TRANSACTION_FAILED', `Transaction ${digest} failed on-chain: ${errMsg}`);
  }
}

async function trySelfFunded(
  client: SuiJsonRpcClient,
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
  await assertTxSuccess(result.effects, result.digest);

  return {
    digest: result.digest,
    effects: result.effects,
    gasMethod: 'self-funded',
    gasCostSui: extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]),
    preTxSuiMist: suiBalance,
  };
}

async function tryAutoTopUpThenSelfFund(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  buildTx: () => Transaction | Promise<Transaction>,
): Promise<GasExecutionResult | null> {
  const address = keypair.getPublicKey().toSuiAddress();

  const canTopUp = await shouldAutoTopUp(client, address);
  if (!canTopUp) return null;

  await executeAutoTopUp(client, keypair);

  // Rebuild the transaction with fresh object versions (auto-topup changed coin state)
  const tx = await buildTx();
  tx.setSender(address);

  const suiAfterTopUp = await getSuiBalance(client, address);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  await assertTxSuccess(result.effects, result.digest);

  return {
    digest: result.digest,
    effects: result.effects,
    gasMethod: 'auto-topup',
    gasCostSui: extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]),
    preTxSuiMist: suiAfterTopUp,
  };
}

async function trySponsored(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<GasExecutionResult | null> {
  const address = keypair.getPublicKey().toSuiAddress();
  const suiBalance = await getSuiBalance(client, address);
  tx.setSender(address);

  // Use serialize() for pure v2 transactions, fall back to build() for
  // mixed v1/v2 transactions (e.g. Cetus aggregator adds v1 commands).
  let txJson: string | undefined;
  let txBcsBase64: string | undefined;
  try {
    txJson = tx.serialize();
  } catch {
    const bcsBytes = await tx.build({ client });
    txBcsBase64 = Buffer.from(bcsBytes).toString('base64');
  }

  const sponsoredResult = await requestGasSponsorship(txJson ?? '', address, undefined, txBcsBase64);

  const sponsoredTxBytes = Buffer.from(sponsoredResult.txBytes, 'base64');
  const { signature: agentSig } = await keypair.signTransaction(sponsoredTxBytes);

  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredResult.txBytes,
    signature: [agentSig, sponsoredResult.sponsorSignature],
    options: { showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });
  await assertTxSuccess(result.effects, result.digest);

  // Report gas usage (best-effort)
  const gasCost = extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]);
  reportGasUsage(address, result.digest, gasCost, 0, sponsoredResult.type);

  return {
    digest: result.digest,
    effects: result.effects,
    gasMethod: 'sponsored',
    gasCostSui: gasCost,
    preTxSuiMist: suiBalance,
  };
}

/**
 * Best-effort indexer readiness check after transaction finalization.
 * Verifies the TX effects are queryable. Note: aggregate indices
 * (getBalance, getDynamicFields) may still lag — callers that need
 * consistent reads should poll their expected state separately.
 */
async function waitForIndexer(client: SuiJsonRpcClient, digest: string): Promise<void> {
  for (let i = 0; i < 3; i++) {
    try {
      await client.getTransactionBlock({ digest, options: { showObjectChanges: true } });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Gas resolution chain:
 * 1. Self-funded (agent has enough SUI)
 * 2. Auto-topup (swap USDC→SUI, then self-fund)
 * 3. Gas Station sponsored (fallback)
 * 4. Fail with INSUFFICIENT_GAS
 *
 * After every successful transaction, proactively tops up SUI if it
 * dropped below threshold — so the user never hits a "no gas" wall.
 */
export async function executeWithGas(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  buildTx: () => Transaction | Promise<Transaction>,
  options?: { metadata?: TxMetadata; enforcer?: SafeguardEnforcer },
): Promise<GasExecutionResult> {
  if (options?.enforcer && options?.metadata) {
    options.enforcer.check(options.metadata);
  }

  const result = await resolveGas(client, keypair, buildTx);

  // Proactive gas maintenance — compute remaining SUI from the TX result
  // instead of querying the indexer (which may still show stale balances).
  try {
    if (result.preTxSuiMist !== undefined) {
      const gasCostMist = result.gasMethod === 'sponsored'
        ? 0n
        : BigInt(Math.round(result.gasCostSui * 1e9));
      const estimatedRemaining = result.preTxSuiMist - gasCostMist;
      if (estimatedRemaining < GAS_RESERVE_TARGET) {
        const address = keypair.getPublicKey().toSuiAddress();
        const usdcBal = await client.getBalance({
          owner: address,
          coinType: SUPPORTED_ASSETS.USDC.type,
        });
        if (BigInt(usdcBal.totalBalance) >= AUTO_TOPUP_MIN_USDC) {
          await executeAutoTopUp(client, keypair);
        }
      }
    }
  } catch { /* best-effort — don't fail the main operation */ }

  return result;
}

const GAS_RESOLUTION_CODES: Set<string> = new Set([
  'INSUFFICIENT_GAS',
  'GAS_STATION_UNAVAILABLE',
  'GAS_FEE_EXCEEDED',
  'AUTO_TOPUP_FAILED',
  'SPONSOR_UNAVAILABLE',
]);

function isBuildError(err: unknown): err is T2000Error {
  return err instanceof T2000Error && !GAS_RESOLUTION_CODES.has(err.code);
}

async function resolveGas(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  buildTx: () => Transaction | Promise<Transaction>,
): Promise<GasExecutionResult> {
  const errors: string[] = [];
  let lastBuildError: T2000Error | undefined;

  // Step 1: Try self-funded
  try {
    const tx = await buildTx();
    const result = await trySelfFunded(client, keypair, tx);
    if (result) {
      await waitForIndexer(client, result.digest);
      return result;
    }
    errors.push('self-funded: SUI below threshold');
  } catch (err) {
    if (err instanceof T2000Error && err.code === 'TRANSACTION_FAILED') throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (isMoveAbort(msg)) {
      throw new T2000Error('TRANSACTION_FAILED', parseMoveAbortMessage(msg));
    }
    if (isBuildError(err)) lastBuildError = err;
    errors.push(`self-funded: ${msg}`);
  }

  // Step 2: Try auto-topup (swap USDC→SUI) then self-fund the main tx
  try {
    const result = await tryAutoTopUpThenSelfFund(client, keypair, buildTx);
    if (result) {
      await waitForIndexer(client, result.digest);
      return result;
    }
    errors.push('auto-topup: not eligible (low USDC or sufficient SUI)');
  } catch (err) {
    if (err instanceof T2000Error && err.code === 'TRANSACTION_FAILED') throw err;
    errors.push(`auto-topup: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2.5: Retry self-funded — auto-topup may have deposited SUI
  // even if the combined operation failed
  try {
    const tx = await buildTx();
    const result = await trySelfFunded(client, keypair, tx);
    if (result) {
      await waitForIndexer(client, result.digest);
      return result;
    }
  } catch (err) {
    if (err instanceof T2000Error && err.code === 'TRANSACTION_FAILED') throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (isMoveAbort(msg)) {
      throw new T2000Error('TRANSACTION_FAILED', parseMoveAbortMessage(msg));
    }
    if (isBuildError(err)) lastBuildError = err;
    errors.push(`self-funded-retry: ${msg}`);
  }

  // Step 3: Try gas station sponsored
  try {
    const tx = await buildTx();
    const result = await trySponsored(client, keypair, tx);
    if (result) {
      await waitForIndexer(client, result.digest);
      return result;
    }
    errors.push('sponsored: returned null');
  } catch (err) {
    if (err instanceof T2000Error && err.code === 'TRANSACTION_FAILED') throw err;
    if (isBuildError(err)) lastBuildError = err;
    errors.push(`sponsored: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 4: All methods failed
  // If buildTx() consistently threw a non-gas T2000Error (e.g.
  // INSUFFICIENT_BALANCE), surface that instead of misleading INSUFFICIENT_GAS.
  if (lastBuildError) throw lastBuildError;

  throw new T2000Error(
    'INSUFFICIENT_GAS',
    `No SUI for gas and sponsorship unavailable. Fund your wallet with SUI or USDC. [${errors.join(' | ')}]`,
    { reason: 'all_gas_methods_exhausted', errors },
  );
}
