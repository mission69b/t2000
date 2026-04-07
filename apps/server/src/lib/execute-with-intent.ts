import { buildScopedIntent, verifyScopedIntent } from '@t2000/sdk';
import type { ScopedIntent } from '@t2000/sdk';
import type { AllowanceFeature } from '@t2000/sdk';
import { prisma } from '../db/prisma.js';
import { getAdminWallet } from './wallets.js';

export interface IntentUser {
  id: string;
  walletAddress: string;
  allowanceObjectId: string;
}

export interface IntentResult {
  digest: string;
  actualAmount: number;
}

export interface ExecuteWithIntentParams {
  user: IntentUser;
  featureCode: AllowanceFeature;
  maxAmount: number;
  operation: (intent: ScopedIntent) => Promise<IntentResult>;
}

/**
 * Standard wrapper for every autonomous cron operation.
 *
 * Lifecycle:
 * 1. Build signed ScopedIntent (nonce + 60s TTL)
 * 2. Check nonce not in IntentLog (replay protection)
 * 3. Write IntentLog with status=issued (audit trail even on crash)
 * 4. Verify intent still valid (expiry + signature)
 * 5. Execute caller-provided operation
 * 6. Update IntentLog to executed or failed
 * 7. Never rethrow — one user failure must not stop the batch
 */
export async function executeWithIntent(params: ExecuteWithIntentParams): Promise<void> {
  const { user, featureCode, maxAmount, operation } = params;

  const adminKeypair = getAdminWallet();
  const intent = await buildScopedIntent(adminKeypair, {
    userId: user.id,
    walletAddress: user.walletAddress,
    allowanceObjectId: user.allowanceObjectId,
    featureCode,
    maxAmount,
    ttlMs: 60_000,
  });

  const existing = await prisma.intentLog.findUnique({
    where: { intentNonce: intent.nonce },
  });
  if (existing) {
    console.error(`[intent] Nonce collision — skipping ${intent.nonce.slice(0, 12)}…`);
    return;
  }

  await prisma.intentLog.create({
    data: {
      intentNonce: intent.nonce,
      userId: user.id,
      walletAddress: user.walletAddress,
      featureCode: intent.featureCode,
      maxAmount: intent.maxAmount,
      expiresAt: new Date(intent.expiresAt),
      status: 'issued',
    },
  });

  try {
    const adminPublicKeyBytes = adminKeypair.getPublicKey().toRawBytes();
    const valid = await verifyScopedIntent(intent, adminPublicKeyBytes);
    if (!valid) {
      throw new Error('Intent verification failed — expired or invalid signature');
    }

    const result = await operation(intent);

    await prisma.intentLog.update({
      where: { intentNonce: intent.nonce },
      data: {
        status: 'executed',
        txDigest: result.digest,
        actualAmount: result.actualAmount,
      },
    });
  } catch (err) {
    await prisma.intentLog.update({
      where: { intentNonce: intent.nonce },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    console.error(`[intent] Failed for user ${user.id}:`, err instanceof Error ? err.message : err);
  }
}
