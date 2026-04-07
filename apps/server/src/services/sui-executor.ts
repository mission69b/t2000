import type { Transaction } from '@mysten/sui/transactions';
import { getAdminWallet, getSuiClient } from '../lib/wallets.js';

export interface TxResult {
  digest: string;
  status: 'success' | 'failure';
}

/**
 * Sign and execute a transaction using the admin keypair.
 * Reusable for allowance deductions (briefings, sessions, DCA, auto-compound).
 */
export async function executeAdminTx(tx: Transaction): Promise<TxResult> {
  const client = getSuiClient();
  const adminKeypair = getAdminWallet();
  const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

  tx.setSender(adminAddress);

  const result = await client.signAndExecuteTransaction({
    signer: adminKeypair,
    transaction: tx,
    options: { showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  const status = result.effects?.status?.status === 'success' ? 'success' : 'failure';
  return { digest: result.digest, status };
}
