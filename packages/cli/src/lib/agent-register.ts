// Shared sponsored-registration helper (Agent ID B.1 gate 5b). Used by
// `t2 agent register`, `t2 agent onboard` (ensure-registered), and `t2 init`
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

export interface RegisterResult {
  digest?: string;
  alreadyRegistered: boolean;
}

/**
 * Register `address` on-chain via the sponsored flow. Throws on failure (the
 * caller decides whether that's fatal — `register` surfaces it; `onboard`/`init`
 * treat it as best-effort).
 */
export async function registerWallet(opts: {
  keypair: SigningKeypair;
  address: string;
  base: string;
}): Promise<RegisterResult> {
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
