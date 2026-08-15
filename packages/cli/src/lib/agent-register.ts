import {
  assertSigningHostAllowed,
  assertTxMatchesIntent,
  describeIntent,
  isAllowUntrustedApi,
  type TxIntent,
} from './tx-guard.js';
import { printLine } from '../output.js';

// Shared sponsored-registration helper (Agent ID B.1 gate 5b). Used by
// `t2 agent register`, `t2 agent create`, and `t2 init`
// (best-effort). Two-phase: prepare (server builds the sponsored tx) → the
// wallet signs the bytes → submit (server sponsor-co-signs + executes).

interface SigningKeypair {
  signTransaction(bytes: Uint8Array): Promise<{ signature: string }>;
}

async function postJson(
  url: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

/**
 * Generic sponsored-tx round-trip: prepare (server builds the tx) → sign the
 * returned bytes → submit (server sponsor-co-signs + executes). (The
 * ownership-link callers left with S.1032; job verbs ride this today.)
 * Returns the tx digest.
 */
export async function runSponsoredTx(opts: {
  keypair: SigningKeypair;
  actor: string;
  prepareUrl: string;
  prepareBody: Record<string, unknown>;
  submitUrl: string;
  /** What the user asked for. REQUIRED — the bytes are checked against it
   *  before signing, and a caller with no intent cannot sign (S.930). */
  intent: TxIntent;
}): Promise<{ digest?: string }> {
  const allowUntrusted = isAllowUntrustedApi();
  // Before the wallet address is even sent anywhere.
  assertSigningHostAllowed(opts.prepareUrl, allowUntrusted);

  // S.1063: some verbs need a PRECURSOR tx first (e.g. reject/refund lazily
  // creating the seller's zero score — a shared object can't be created and
  // used in one tx). The server flags it; we sign+submit the precursor and
  // re-prepare the real verb. Bounded — never an unbounded loop. Every
  // iteration's bytes still pass the SAME intent check (the precursor's
  // target is allowlisted under the verb's own action).
  let prep = await postJson(opts.prepareUrl, opts.prepareBody);
  let hops = 0;
  while (prep.precursor && hops < 3) {
    hops += 1;
    await signAndSubmit(prep, opts, allowUntrusted);
    prep = await postJson(opts.prepareUrl, opts.prepareBody);
  }
  const nonce = prep.nonce as string | undefined;
  const txBytes = prep.txBytes as string | undefined;
  if (!(nonce && txBytes)) {
    throw new Error('Failed to prepare the transaction.');
  }
  // The server proposed; now check it proposed what we asked for.
  assertTxMatchesIntent(txBytes, opts.intent, { allowUntrusted });
  printLine(describeIntent(opts.intent, opts.prepareUrl));

  const bytes = new Uint8Array(Buffer.from(txBytes, 'base64'));
  const { signature } = await opts.keypair.signTransaction(bytes);
  const res = await postJson(opts.submitUrl, {
    nonce,
    address: opts.actor,
    signature,
  });
  return { digest: res.digest as string | undefined };
}

/** One precursor hop: intent-check, sign, submit (S.1063 lazy score
 *  create). Shares the exact gate the main verb uses. */
async function signAndSubmit(
  prep: Record<string, unknown>,
  opts: {
    keypair: SigningKeypair;
    actor: string;
    prepareUrl: string;
    submitUrl: string;
    intent: TxIntent;
  },
  allowUntrusted: boolean,
): Promise<void> {
  const nonce = prep.nonce as string | undefined;
  const txBytes = prep.txBytes as string | undefined;
  if (!(nonce && txBytes)) {
    throw new Error('Failed to prepare the transaction.');
  }
  assertTxMatchesIntent(txBytes, opts.intent, { allowUntrusted });
  const bytes = new Uint8Array(Buffer.from(txBytes, 'base64'));
  const { signature } = await opts.keypair.signTransaction(bytes);
  await postJson(opts.submitUrl, { nonce, address: opts.actor, signature });
}

export interface RegisterResult {
  digest?: string;
  alreadyRegistered: boolean;
}

/**
 * Register `address` on-chain via the sponsored flow. Throws on failure (the
 * caller decides whether that's fatal — `register` surfaces it; `create`/`init`
 * treat it as best-effort).
 */
export async function registerWallet(opts: {
  keypair: SigningKeypair;
  address: string;
  base: string;
}): Promise<RegisterResult> {
  const allowUntrusted = isAllowUntrustedApi();
  assertSigningHostAllowed(opts.base, allowUntrusted);
  const prep = await postJson(`${opts.base}/agent/register/prepare`, {
    address: opts.address,
  });
  // Idempotent: already on-chain → nothing to sign.
  if (prep.alreadyRegistered === true) {
    return { alreadyRegistered: true };
  }
  const regNonce = prep.regNonce as string | undefined;
  const txBytes = prep.txBytes as string | undefined;
  if (!(regNonce && txBytes)) {
    throw new Error('Failed to prepare registration.');
  }
  assertTxMatchesIntent(txBytes, { action: 'register' }, { allowUntrusted });
  const bytes = new Uint8Array(Buffer.from(txBytes, 'base64'));
  const { signature } = await opts.keypair.signTransaction(bytes);
  const res = await postJson(`${opts.base}/agent/register/submit`, {
    regNonce,
    address: opts.address,
    agentSignature: signature,
  });
  return {
    digest: res.digest as string | undefined,
    alreadyRegistered: Boolean(res.alreadyRegistered),
  };
}
