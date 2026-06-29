// Agent Commerce — gateway-mediated settlement (prototype C.2).
//
// The model (locked: collect-then-forward, 250 bps): a buyer agent pays the
// treasury via the proven x402 collect path; the gateway keeps the facilitator
// fee and forwards the net to the seller agent via the gasless treasury send,
// then records a cross-party receipt. The brief treasury custody between
// collect and forward is the seam a future escrow/dispute hold plugs into.
//
// Receipts reuse the existing MppPayment table (service="commerce") so the
// prototype needs no schema migration; a dedicated CommerceReceipt table is a
// spec follow-up.

import { logPayment } from './log-payment';

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

/** Record a commerce settlement as an MppPayment row (prototype). The forward
 *  digest is the unique key; buyer + seller + gross are captured in the
 *  service/endpoint/amount/sender fields. */
export async function recordCommerceReceipt(receipt: {
  buyer: string;
  seller: string;
  grossDecimal: string;
  forwardDigest: string;
}): Promise<void> {
  await logPayment({
    service: 'commerce',
    endpoint: receipt.seller,
    amount: receipt.grossDecimal,
    digest: receipt.forwardDigest,
    sender: receipt.buyer,
  });
}
