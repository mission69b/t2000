// The sponsored registry rail (register · endpoint list/remove): the server
// builds the tx, the seller signs the bytes, the server sponsor-co-signs
// and executes. Gasless; the Move contract authorizes on ctx.sender(), so
// sponsorship never weakens auth. The host guard (`setSponsoredTxGuard`)
// runs before the address leaves the process and again on the bytes.

import { fromBase64 } from '@mysten/sui/utils';
import type { TransactionSigner } from '../signer.js';
import { runSponsoredTxGuard } from '../sponsored-guard.js';

/** Sign prepared bytes (after the guard sees them). */
export async function signPreparedTx(
  base: string,
  action: string,
  signer: TransactionSigner,
  txBytes: string,
): Promise<string> {
  runSponsoredTxGuard({ base, action, txBytes });
  const { signature } = await signer.signTransaction(fromBase64(txBytes));
  return signature;
}
