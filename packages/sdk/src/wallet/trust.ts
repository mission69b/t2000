import { T2000Error } from '../errors.js';

// The ONE buyer post knob (S.1209) — `trustRequirement` replaces the dual
// claimPolicy/minSellerLevel gate on every write surface. Pure module (no
// chain deps) so `opening.ts`, `reputation.ts` consumers, the CLI, and
// browser bundles can all import the mapping without cycles.

/** Who may claim a posting — the single buyer trust knob since S.1209.
 *  Maps to the on-chain `min_seller_level` floor; `claim_policy` is ALWAYS
 *  written 0 (legacy Proven policies are read-only stragglers). `veteran`
 *  is CLI power-user only — never offered in MCP/Connect, still enforced
 *  if posted. */
export type TrustRequirement = 'open' | 'established' | 'top' | 'veteran';

export const TRUST_REQUIREMENTS = [
  'open',
  'established',
  'top',
  'veteran',
] as const;

/** Write-mapping SSOT (S.1209): trustRequirement → minSellerLevel. A floor
 *  of 1 is not a product state — every registered agent is at least New. */
export const TRUST_REQUIREMENT_MIN_LEVEL: Record<TrustRequirement, number> = {
  open: 0,
  established: 2,
  top: 3,
  veteran: 4,
};

export function minSellerLevelForTrustRequirement(
  requirement: TrustRequirement,
): number {
  return TRUST_REQUIREMENT_MIN_LEVEL[requirement];
}

/** Parse a user-supplied trust requirement (case-insensitive) — throws the
 *  one English error every surface relays verbatim. */
export function parseTrustRequirement(raw: string): TrustRequirement {
  const v = raw.trim().toLowerCase();
  if ((TRUST_REQUIREMENTS as readonly string[]).includes(v)) {
    return v as TrustRequirement;
  }
  throw new T2000Error(
    'INVALID_INPUT',
    `trustRequirement must be one of open · established · top · veteran (got "${raw}").`,
  );
}
