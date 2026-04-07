import type { AllowanceFeature } from '../constants.js';

/**
 * Short-lived signed authorization for a single autonomous cron execution.
 * Built off-chain, verified off-chain before any on-chain PTB is constructed.
 *
 * Security properties:
 * - 60s TTL (configurable) — expired intents rejected before execution
 * - Single-use nonce — stored in IntentLog, duplicate rejected immediately
 * - Ed25519 signature by admin key — tamper-proof envelope
 * - maxAmount ceiling — PTB builder must not exceed this
 */
export interface ScopedIntent {
  version: 1;
  userId: string;
  walletAddress: string;
  allowanceObjectId: string;
  featureCode: AllowanceFeature;
  maxAmount: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature: string;
}

export type ScopedIntentPayload = Omit<ScopedIntent, 'signature'>;
