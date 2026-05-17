// ---------------------------------------------------------------------------
// dust.ts — shared dust thresholds for value-based filtering
// ---------------------------------------------------------------------------
//
// Pre-2.0.3 this constant was defined locally in 3 places (tools/health.ts,
// v2/enrich-pending-action.ts, navi/transforms.ts) with identical values.
// Hoisted here when repay.ts became the 4th consumer so changes stay
// coherent across every read + write surface that treats sub-cent debt
// or sub-cent positions as "noise".
//
// Per `coding-discipline.mdc`: factor when the LOGIC duplicates. Three
// copies of `const DEBT_DUST_USD = 0.01` with identical intent IS the
// same logic, not just the same shape.
// ---------------------------------------------------------------------------

/**
 * Anything below this USD threshold is treated as "no real debt".
 *
 * NAVI's lending pools accrue interest between blocks and leave sub-cent
 * dust borrow rows for ~30-60s after a full repay. Treating those as
 * real debt would:
 *   - Flip the user's status from "Healthy" to "Critical" right after
 *     a successful repay (HF math says HF=∞ for zero debt, but with dust
 *     the math returns very-low-finite numbers that read as liquidation)
 *   - Render text like "Remaining debt is minimal at $0.001" — confusing
 *     to a user who just tapped "Repay all debt"
 *   - Project a borrow preview as "0.00 → ∞" because the dust borrowed
 *     value tripped `borrowed === 0` checks falsy
 *
 * Used by:
 *   - tools/health.ts          → hfStatus, serializeHf, suppliedAssets dust filter
 *   - tools/repay.ts           → remainingDebt display floor
 *   - v2/enrich-pending-action → currentHF coercion + projectedHF dust check
 *   - navi/transforms.ts       → per-asset position filter (ASSET_DUST_USD alias)
 */
export const DEBT_DUST_USD = 0.01;

/**
 * Alias for the same threshold when used to filter per-asset position
 * rows (e.g. drop "$0.00 USDC supplied" noise rows). Same value,
 * different intent — kept as a separate symbol so the two semantic
 * uses (debt-as-no-debt vs filter-this-row) are independently
 * tweakable in the future if needed.
 */
export const ASSET_DUST_USD = 0.01;
