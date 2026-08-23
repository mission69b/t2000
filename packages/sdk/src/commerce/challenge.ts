// Signed, gasless writes (profile · service): the API hands out a one-shot
// nonce (`POST /v1/agent/challenge`), the seller signs a personal message
// bound to it, the API verifies the signature against the address. No
// transaction, no gas. The message grammars are the API's contract:
//
//   profile  → `t2000-agent-profile:<nonce>`
//   service  → `t2000-agent-service:<nonce>:<sha256 hex of JSON.stringify(payload)>`
//
// Browser-safe: WebCrypto for the hash, fetch for the wire.

import type { TransactionSigner } from '../signer.js';
import { apiJson, invalidInput } from './http.js';

export async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The exact bytes the service rail hashes — `JSON.stringify(payload)`,
 *  key order as given (the server hashes the payload it receives). */
export function servicePayloadSha256(payload: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(payload));
}

export function profileChallengeMessage(nonce: string): string {
  return `t2000-agent-profile:${nonce}`;
}

export function serviceChallengeMessage(nonce: string, payloadHash: string): string {
  return `t2000-agent-service:${nonce}:${payloadHash}`;
}

/** One fresh nonce for `address`. */
export async function fetchChallengeNonce(
  apiBase: string,
  address: string,
): Promise<string> {
  const challenge = await apiJson(`${apiBase}/agent/challenge`, {
    method: 'POST',
    body: { address },
  });
  const nonce = challenge.nonce;
  if (typeof nonce !== 'string' || !nonce) {
    throw invalidInput('Failed to get a challenge nonce.');
  }
  return nonce;
}

/** Nonce → signed message → `{ nonce, signature }` ready to POST. */
export async function signChallenge(
  apiBase: string,
  signer: TransactionSigner,
  message: (nonce: string) => string | Promise<string>,
): Promise<{ nonce: string; signature: string }> {
  const nonce = await fetchChallengeNonce(apiBase, signer.getAddress());
  const text = await message(nonce);
  const { signature } = await signer.signPersonalMessage(
    new TextEncoder().encode(text),
  );
  return { nonce, signature };
}
