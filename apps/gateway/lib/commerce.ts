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
// Don't issue a refund tx below this (gasless floor + churn) — keep the excess.
const REFUND_DUST_MICROS = 5_000;
// Smallest billable charge so the seller's net still clears the gasless floor
// (net = actual − fee ≥ $0.01). ceil(10000 / (1 − 0.025)) ≈ 10257.
const MIN_BILLABLE_MICROS = 10_300;

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

export interface UptoSettlement {
  /** What the buyer is actually charged (≤ authorized max). */
  actualMicros: number;
  /** Returned to the buyer (authorized − actual); 0 when below the dust floor. */
  refundMicros: number;
  /** Facilitator fee on the ACTUAL. */
  feeMicros: number;
  /** Forwarded to the seller (actual − fee). */
  netMicros: number;
  netDecimal: string;
  refundDecimal: string;
}

/**
 * Usage-based (`sui-upto`) settlement — Mechanism A (settle-then-refund). The
 * buyer authorized `authorizedMicros` (the max, already collected to treasury);
 * the seller reports the actual cost via X-402-Settle-Amount. We charge the
 * actual (≤ max, ≥ MIN_BILLABLE so the seller's net clears the gasless floor),
 * refund the excess to the buyer (unless it's dust), and keep the fee on the
 * actual. A null/absent report = exact (charge the full authorized amount).
 */
export function uptoSettlement(
  authorizedMicros: number,
  reportedActualMicros: number | null,
): UptoSettlement {
  let actual =
    reportedActualMicros == null ? authorizedMicros : reportedActualMicros;
  // Clamp: never above the authorized max, never below the min billable.
  actual = Math.min(Math.max(actual, MIN_BILLABLE_MICROS), authorizedMicros);
  let refund = authorizedMicros - actual;
  // Sub-dust savings aren't worth a refund tx → charge the full max (exact).
  if (refund < REFUND_DUST_MICROS) {
    actual = authorizedMicros;
    refund = 0;
  }
  const feeMicros = Math.floor((actual * FACILITATOR_FEE_BPS) / BPS_DENOM);
  const netMicros = actual - feeMicros;
  return {
    actualMicros: actual,
    refundMicros: refund,
    feeMicros,
    netMicros,
    netDecimal: (netMicros / USDC_ATOMIC).toFixed(6),
    refundDecimal: (refund / USDC_ATOMIC).toFixed(6),
  };
}

// [S.697] Hosted-compute fee (founder-locked 2026-07-09): deliveries that
// t2000 RUNS (hosted handlers + config-proxy wraps) carry an extra 2.5% of
// the charged amount — "self-host: 2.5%, t2000 runs it: 5%". Deducted from
// the seller's net at settle, floor-guarded so the forwarded net never drops
// below the $0.01 gasless minimum (fee waived down to keep net ≥ floor —
// listing floors already guarantee net-at-2.5% clears it).
export const COMPUTE_FEE_BPS = 250;
const NET_FLOOR_MICROS = 10_000;

export function computeFeeMicros(
  chargedMicros: number,
  netAfterFacilitatorMicros: number,
  hosted: boolean,
): number {
  if (!hosted) {
    return 0;
  }
  const fee = Math.floor((chargedMicros * COMPUTE_FEE_BPS) / BPS_DENOM);
  return Math.min(fee, Math.max(0, netAfterFacilitatorMicros - NET_FLOOR_MICROS));
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
