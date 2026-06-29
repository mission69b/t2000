// Agent Commerce — gateway-mediated settlement (prototype C.2).
//
// The model (locked: collect-then-forward, 250 bps): a buyer agent pays the
// treasury via the proven x402 collect path; the gateway keeps the facilitator
// fee and forwards the net to the seller agent via the gasless treasury send,
// then records a cross-party receipt. The brief treasury custody between
// collect and forward is the seam a future escrow/dispute hold plugs into.
//
// Receipts are written to the dedicated CommerceReceipt ledger (A) —
// cross-party, status-bearing, idempotent on the collect digest.

import { prisma } from './prisma';

/** Facilitator take rate (basis points). Prototype constant; spec will make
 *  this configurable + add a flat dust-floor. */
export const FACILITATOR_FEE_BPS = 250;

const BPS_DENOM = 10_000;
const USDC_ATOMIC = 1_000_000;
// Net must clear the $0.01 gasless-send floor (treasury → seller).
const GASLESS_MIN_ATOMIC = 10_000;

export interface CommerceSplit {
  grossMicros: number;
  feeMicros: number;
  netMicros: number;
  /** Net as a decimal USDC string for the gasless treasury send. */
  netDecimal: string;
}

/** Split a gross decimal-USDC amount into fee + net at the facilitator rate.
 *  Returns null when the net would fall below the gasless minimum. */
export function splitAmount(grossDecimal: string): CommerceSplit | null {
  const grossMicros = Math.floor(Number(grossDecimal) * USDC_ATOMIC);
  if (!Number.isFinite(grossMicros) || grossMicros <= 0) {
    return null;
  }
  const feeMicros = Math.floor((grossMicros * FACILITATOR_FEE_BPS) / BPS_DENOM);
  const netMicros = grossMicros - feeMicros;
  if (netMicros < GASLESS_MIN_ATOMIC) {
    return null;
  }
  return {
    grossMicros,
    feeMicros,
    netMicros,
    netDecimal: (netMicros / USDC_ATOMIC).toFixed(6),
  };
}

export type CommerceStatus = 'settled' | 'refunded' | 'settlement_due';

/** Record (or update) a commerce settlement in the ledger. Idempotent on the
 *  collect digest — a retry updates status/forwardDigest rather than dup-ing.
 *  Never throws (a ledger-write failure must not break the buyer's response). */
export async function recordCommerceReceipt(receipt: {
  buyer: string;
  seller: string;
  resource?: string | null;
  grossMicros: number;
  feeMicros: number;
  netMicros: number;
  status: CommerceStatus;
  collectDigest: string;
  forwardDigest?: string | null;
}): Promise<void> {
  try {
    await prisma.commerceReceipt.upsert({
      where: { collectDigest: receipt.collectDigest },
      create: {
        buyer: receipt.buyer,
        seller: receipt.seller,
        resource: receipt.resource ?? null,
        grossMicros: receipt.grossMicros,
        feeMicros: receipt.feeMicros,
        netMicros: receipt.netMicros,
        feeBps: FACILITATOR_FEE_BPS,
        status: receipt.status,
        collectDigest: receipt.collectDigest,
        forwardDigest: receipt.forwardDigest ?? null,
      },
      update: {
        status: receipt.status,
        forwardDigest: receipt.forwardDigest ?? undefined,
      },
    });
  } catch (err) {
    console.error(
      `[commerce] receipt write failed collect=${receipt.collectDigest}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
