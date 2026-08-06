// The services settle fee, said out loud (S.932).
//
// Beta feedback: a seller listed a service and nowhere in the CLI did the
// word "fee" appear outside the phrase "fee-free". The 5% is real — it comes
// off the SELLER's payout at settle, never on top of the buyer's escrow — and
// a seller finding out at settlement is finding out too late.
//
// One module so `service` and `job` can't drift into two different numbers or
// two different roundings.

/**
 * Display default for the services settle fee.
 *
 * On-chain truth is the `fee_bps` locked into each Job at funding (from
 * FeeConfig), which is what actually settles. This constant exists so human
 * output has one number to quote, NOT so the CLI becomes a second source of
 * truth for the fee.
 */
export const SERVICES_SETTLE_FEE_BPS = 500;

const MICRO = 1_000_000;
const TRAILING_ZEROS = /0+$/;

/** Exact USDC from integer micro-units — up to 6dp, trailing zeros trimmed,
 *  never fewer than 2dp, and always floored. A seller's "you receive" that
 *  rounds UP is a promise the chain won't keep. */
export function formatUsdMicro(micro: number): string {
  if (!Number.isFinite(micro) || micro < 0) {
    return '—';
  }
  const m = Math.floor(micro);
  const whole = Math.floor(m / MICRO);
  const frac = String(m % MICRO).padStart(6, '0');
  const dp = Math.max(2, frac.replace(TRAILING_ZEROS, '').length);
  return `$${whole}.${frac.slice(0, dp)}`;
}

export interface SettlementSplit {
  /** What the buyer escrows — the listed price, unchanged. */
  escrowUsdc: number;
  feeBps: number;
  feeMicro: number;
  payoutMicro: number;
  /** Display strings, floored. */
  escrow: string;
  fee: string;
  payout: string;
}

/**
 * Split a price into the protocol fee and the seller's payout using the same
 * integer micro math the Move contract does: floor the fee, seller keeps the
 * remainder. The buyer's number never changes — the fee is not added on top.
 */
export function settlementSplit(
  priceUsdc: number,
  feeBps: number = SERVICES_SETTLE_FEE_BPS,
): SettlementSplit {
  const escrowMicro = Math.floor(priceUsdc * MICRO);
  const feeMicro = Math.floor((escrowMicro * feeBps) / 10_000);
  const payoutMicro = escrowMicro - feeMicro;
  return {
    escrowUsdc: priceUsdc,
    feeBps,
    feeMicro,
    payoutMicro,
    escrow: formatUsdMicro(escrowMicro),
    fee: formatUsdMicro(feeMicro),
    payout: formatUsdMicro(payoutMicro),
  };
}

/** Seller-facing one-liner for a listed price. */
export function sellerReceivesLine(priceUsdc: number): string {
  const s = settlementSplit(priceUsdc);
  return `${s.payout} after the ${s.feeBps / 100}% settle fee (${s.fee})`;
}

/** The standing disclosure, one sentence. Buyers escrow the listed price;
 *  the fee is the seller's, and a refund costs neither side anything. */
export const SETTLE_FEE_NOTE =
  `Services settle at ${SERVICES_SETTLE_FEE_BPS / 100}% from the seller's payout — never added to the buyer's escrow. Refunds, cancels and declines are fee-free.`;
