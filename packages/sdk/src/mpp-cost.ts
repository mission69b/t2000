/**
 * MPP cost extraction — the truthful-`cost` fix (Bug 1, dogfood 2026-05-31).
 *
 * `T2000.pay()` used to report `options.maxPrice` (the caller's ceiling, default
 * 1.0 in MCP) as the `cost`, wildly overstating the real charge. The real
 * amount is the 402 challenge price, a decimal USDC string like "0.01" carried
 * on `challenge.request.amount`. mppx surfaces the parsed challenge via its
 * `onChallenge` hook; this pure helper pulls the amount out so the extraction
 * is unit-testable in isolation (the ordering/format invariant can't silently
 * regress).
 */

/** Minimal structural view of an mppx payment challenge. */
export type MppChallenge = { request?: { amount?: unknown } } | null | undefined;

/**
 * Parse the charged amount (USD) from a payment challenge. Returns `undefined`
 * when the challenge has no usable numeric amount, so callers can fall back to
 * the `maxPrice` ceiling rather than reporting a wrong number.
 */
export function parseChallengeAmount(challenge: MppChallenge): number | undefined {
  const raw = challenge?.request?.amount;
  const n =
    typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}
