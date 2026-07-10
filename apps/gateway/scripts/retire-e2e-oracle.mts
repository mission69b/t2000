/**
 * One-shot (S.699 cleanup): deactivate the E2E Test Oracle's Agent ID.
 * Runs in CI with E2E_TEST_PRIVATE_KEY (the secret can't be read back, but a
 * workflow can SIGN with it). Sponsored registry `set_active(false)` via the
 * public prepare/submit endpoints. Delete this script + its workflow after
 * the run.
 */
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const API = 'https://api.t2000.ai/v1';
const ORACLE =
  '0x23d299298b1664423e628fd822b7a8e01b0bf0cab6faadf1891fda4eebfddca0';

const secret = process.env.E2E_TEST_PRIVATE_KEY;
if (!secret) {
  console.error('E2E_TEST_PRIVATE_KEY not set');
  process.exit(1);
}
const keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(secret).secretKey);
const address = keypair.toSuiAddress();
if (address !== ORACLE) {
  console.error(`key derives ${address}, expected the oracle ${ORACLE} — refusing`);
  process.exit(1);
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

const prep = await postJson(`${API}/agent/active/prepare`, {
  address,
  active: false,
});
const bytes = new Uint8Array(Buffer.from(String(prep.txBytes), 'base64'));
const { signature } = await keypair.signTransaction(bytes);
const sub = await postJson(`${API}/agent/active/submit`, {
  nonce: prep.nonce,
  address,
  signature,
});
console.log(`oracle set_active(false): ${sub.digest}`);
