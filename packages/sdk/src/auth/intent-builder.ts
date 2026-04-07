import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import type { AllowanceFeature } from '../constants.js';
import type { ScopedIntent, ScopedIntentPayload } from '../types/scoped-intent.js';

const DEFAULT_TTL_MS = 60_000; // 60 seconds

export interface BuildIntentParams {
  userId: string;
  walletAddress: string;
  allowanceObjectId: string;
  featureCode: AllowanceFeature;
  maxAmount: number;
  ttlMs?: number;
}

/**
 * Build a ScopedIntent signed by the admin keypair.
 * Generates a cryptographically random 32-byte nonce and signs the canonical payload.
 */
export async function buildScopedIntent(
  adminKeypair: Ed25519Keypair,
  params: BuildIntentParams,
): Promise<ScopedIntent> {
  const now = Date.now();
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = Buffer.from(nonceBytes).toString('hex');

  const payload: ScopedIntentPayload = {
    version: 1,
    userId: params.userId,
    walletAddress: params.walletAddress,
    allowanceObjectId: params.allowanceObjectId,
    featureCode: params.featureCode,
    maxAmount: params.maxAmount,
    issuedAt: now,
    expiresAt: now + (params.ttlMs ?? DEFAULT_TTL_MS),
    nonce,
  };

  const message = canonicalIntentBytes(payload);
  const signature = await adminKeypair.sign(message);

  return {
    ...payload,
    signature: Buffer.from(signature).toString('hex'),
  };
}

/**
 * Verify a ScopedIntent:
 * 1. Check TTL — reject expired intents immediately (fast path)
 * 2. Verify Ed25519 signature over canonical payload
 */
export async function verifyScopedIntent(
  intent: ScopedIntent,
  adminPublicKeyBytes: Uint8Array,
): Promise<boolean> {
  if (Date.now() > intent.expiresAt) return false;

  const payload: ScopedIntentPayload = {
    version: intent.version,
    userId: intent.userId,
    walletAddress: intent.walletAddress,
    allowanceObjectId: intent.allowanceObjectId,
    featureCode: intent.featureCode,
    maxAmount: intent.maxAmount,
    issuedAt: intent.issuedAt,
    expiresAt: intent.expiresAt,
    nonce: intent.nonce,
  };

  const message = canonicalIntentBytes(payload);
  const signatureBytes = Buffer.from(intent.signature, 'hex');

  try {
    const publicKey = new Ed25519PublicKey(adminPublicKeyBytes);
    return await publicKey.verify(message, signatureBytes);
  } catch {
    return false;
  }
}

/**
 * Deterministic serialization: sorted keys, no whitespace.
 * Guarantees signature verification is independent of property insertion order.
 */
function canonicalIntentBytes(payload: ScopedIntentPayload): Uint8Array {
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
  );
  return new TextEncoder().encode(JSON.stringify(sorted));
}
