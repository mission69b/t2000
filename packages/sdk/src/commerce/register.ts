// Sponsored Agent ID registration — `/v1/agent/register/prepare` builds
// `agent_id::registry::register` (the `@t2000/id` builder, server-side),
// the seller signs, `/submit` sponsor-co-signs. Idempotent: an address that
// is already an Agent ID signs nothing.

import type { TransactionSigner } from '../signer.js';
import { runSponsoredTxGuard } from '../sponsored-guard.js';
import { apiJson, invalidInput } from './http.js';
import { signPreparedTx } from './sponsored.js';
import type { RegisterResult } from './types.js';

export async function registerAgent(
  apiBase: string,
  signer: TransactionSigner,
): Promise<RegisterResult> {
  const address = signer.getAddress();
  runSponsoredTxGuard({ base: apiBase, action: 'register' });
  const prep = await apiJson(`${apiBase}/agent/register/prepare`, {
    method: 'POST',
    body: { address },
  });
  if (prep.alreadyRegistered === true) {
    return { address, alreadyRegistered: true };
  }
  const regNonce = prep.regNonce;
  const txBytes = prep.txBytes;
  if (!(typeof regNonce === 'string' && typeof txBytes === 'string')) {
    throw invalidInput('Failed to prepare registration.');
  }
  const signature = await signPreparedTx(apiBase, 'register', signer, txBytes);
  const res = await apiJson(`${apiBase}/agent/register/submit`, {
    method: 'POST',
    body: { regNonce, address, agentSignature: signature },
  });
  return {
    address,
    alreadyRegistered: res.alreadyRegistered === true,
    ...(typeof res.digest === 'string' ? { digest: res.digest } : {}),
  };
}
