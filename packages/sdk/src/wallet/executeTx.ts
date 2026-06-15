import type { SuiClientTypes } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import type { TransactionSigner } from '../signer.js';
import type { SuiCoreClient } from '../utils/sui.js';

// ---------------------------------------------------------------------------
// executeTx — build + sign + submit + wait, the SDK's one tx-execution helper.
//
// Browser-safe (no fs / keyManager / ContactManager imports) so it can back
// both the Node-side `T2000` methods AND the browser-side `payWithMpp`
// (gasless MPP runs client-side on the zkLogin session key). Moved out of
// `t2000.ts` so `wallet/pay.ts` can share it without pulling the Node-only
// `T2000` module graph into the browser bundle.
//
// [gRPC migration] Submit + wait go through the unified `client.core.*`
// API (`executeTransaction` + `waitForTransaction`), which is transport-
// agnostic across the JSON-RPC and gRPC clients.
// ---------------------------------------------------------------------------

export type SuiTransactionEffects = SuiClientTypes.TransactionEffects;
export type BuildClient = NonNullable<Parameters<Transaction['build']>[0]>['client'];

export async function executeTx(
  client: SuiCoreClient,
  signer: TransactionSigner,
  buildTx: () => Promise<Transaction> | Transaction,
  options: { buildClient?: BuildClient } = {},
): Promise<{ digest: string; gasCostSui: number; effects: SuiTransactionEffects | undefined }> {
  const tx = await buildTx();
  tx.setSender(signer.getAddress());
  // [2026-05-22] Optional buildClient. When set, `tx.build()` uses it to
  // resolve the PTB — relevant for gasless stablecoin transfers where the
  // SuiGrpcClient build path auto-detects allowlisted ops and zeros out
  // gasPrice/gasBudget/gasPayment. See `payWithMpp`.
  const txBytes = await tx.build({ client: options.buildClient ?? client });
  const { signature } = await signer.signTransaction(txBytes);
  const result = await client.core.executeTransaction({
    transaction: txBytes,
    signatures: [signature],
    include: { effects: true },
  });
  const txn = result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
  await client.core.waitForTransaction({ digest: txn.digest });
  const effects = txn.effects ?? undefined;
  const gasUsed = effects?.gasUsed;
  let gasCostSui = 0;
  if (gasUsed) {
    const total = BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost) - BigInt(gasUsed.storageRebate);
    gasCostSui = Number(total) / 1e9;
  }
  return { digest: txn.digest, gasCostSui, effects };
}
