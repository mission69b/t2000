// Builder-appropriate safety, layer 2 (SPEC_AUDRIC_V3 §7 / safeguards-defense-
// in-depth.mdc). `preflight()` is CHEAP, PURE, SYNCHRONOUS input validation —
// no network, no I/O, no context lookup. It runs BEFORE the LLM round-trip /
// before the tap-to-confirm card, so a malformed intent is rejected without
// the user ever seeing a confirm for it.
//
// Each write builder co-locates its own `preflight*` validator (send.ts →
// `preflightSend`, pay.ts → `preflightPay`, cetus-swap.ts → `preflightSwap`).
// This module owns ONLY the shared result type + the two pure primitives those
// validators compose (amount sanity + sync address validity). The agent-loop
// guards that read conversation/session state stay in the v3 HOST (they are
// NOT builder-appropriate, S.442/S.443).

import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import type { T2000ErrorCode } from './errors.js';

/**
 * The result of a synchronous preflight check. `valid: false` carries a
 * `T2000ErrorCode` + human message so the host can surface a precise reason
 * (and the builder can rethrow it as a `T2000Error` verbatim).
 */
export type PreflightResult =
  | { valid: true }
  | { valid: false; code: T2000ErrorCode; error: string };

/**
 * Fat-finger / overflow ceiling for an asset amount. NOT a spending policy
 * (that's the `@t2000/sdk/limits` module — USD-denominated, opt-in, stateful);
 * this is the "obviously wrong number" guard the safeguards rule prescribes
 * (`amount > 1_000_000` → unreasonable).
 */
export const PREFLIGHT_MAX_AMOUNT = 1_000_000;

export const PREFLIGHT_OK: PreflightResult = { valid: true };

export function preflightFail(code: T2000ErrorCode, error: string): PreflightResult {
  return { valid: false, code, error };
}

/**
 * Pure positive-finite-amount sanity check (no network). Rejects NaN/Infinity
 * and non-positive values. The absurd-value ceiling defaults to
 * {@link PREFLIGHT_MAX_AMOUNT} but callers can raise it — pass
 * `max: Number.POSITIVE_INFINITY` for swaps of low-unit-value tokens
 * (memecoins legitimately trade in millions/billions of units), where a fixed
 * display-amount ceiling would be a false positive.
 */
export function checkPositiveAmount(
  amount: number,
  label = 'Amount',
  max: number = PREFLIGHT_MAX_AMOUNT,
): PreflightResult {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return preflightFail('INVALID_AMOUNT', `${label} must be a finite number`);
  }
  if (amount <= 0) {
    return preflightFail('INVALID_AMOUNT', `${label} must be greater than zero`);
  }
  if (amount > max) {
    return preflightFail('INVALID_AMOUNT', `${label} ${amount} exceeds the sane maximum (${max})`);
  }
  return PREFLIGHT_OK;
}

/**
 * Pure, synchronous Sui-address validity (no throw, no network) — the
 * non-throwing sibling of `validateAddress`. Use in preflight; use
 * `validateAddress` when you need the normalized form.
 */
export function checkSuiAddress(address: string, label = 'recipient'): PreflightResult {
  try {
    // `normalizeSuiAddress('')` pads to the zero address (which is "valid"), so
    // guard empty / whitespace-only input before normalizing.
    if (typeof address === 'string' && address.trim() !== '' &&
        isValidSuiAddress(normalizeSuiAddress(address))) {
      return PREFLIGHT_OK;
    }
  } catch {
    // normalizeSuiAddress throws on malformed input → fall through to the fail.
  }
  return preflightFail('INVALID_ADDRESS', `Invalid ${label} address: ${address}`);
}
