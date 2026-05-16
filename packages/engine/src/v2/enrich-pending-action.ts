// ---------------------------------------------------------------------------
// v2/enrich-pending-action.ts — stamp live NAVI data on pending_action
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Week 4 cleanup — Day 14a (2026-05-16), extended Day 14c
// (2026-05-16) with `projectedHF`.
//
// Reads the NAVI rates + health-factor caches at `pending_action` emit
// time and returns the `borrowApyBps` / `currentHF` / `projectedHF`
// fields to stamp on the PendingAction. Audric V2 components
// (BorrowPreviewBody, RepayPreviewBody, WithdrawPreviewBody,
// SavePreviewBody) detect these fields and render `APYBlock` + `HFRow`
// primitives instead of the pre-Week-4 italic disclaimer + missing HF
// row. `projectedHF` lets the row render as "current → projected" so
// the user sees the HF impact before approving.
//
// Behaviour:
//   - Both fetches happen in parallel (Promise.all) — borrow tools need
//     both fields, ~30-300ms saved on cache-miss vs sequential.
//   - Fail-soft on every error: returns `{}` (or partial result) without
//     throwing. The PendingAction still emits; the V2 component falls
//     back to the pre-Week-4 honest-degradation rendering.
//   - No-op when `mcpManager` is absent OR the tool doesn't benefit
//     from either field (avoids paying NAVI cache lookups for sends /
//     swaps / pays).
//   - HF semantics: `number` = finite HF, `null` = ∞ (no debt, infinitely
//     safe). `undefined` = data unavailable. Matches the same wire
//     contract as `health_check`'s `serializeHf`.
//
// v2-only scope: legacy `QueryEngine` is being deleted at Week 6, so we
// don't backport the enrichment to `engine.ts`. Audric V2 components
// treat both fields as opt-in.
// ---------------------------------------------------------------------------

import type { ToolContext } from '../types.js';
import type { McpClientManager } from '../mcp/client.js';
import { fetchRates, fetchHealthFactor } from '../navi/reads.js';

/** Tools whose pending_action benefits from live NAVI borrow APY. */
const BORROW_APY_TOOLS = new Set(['borrow', 'repay_debt']);

/** Tools whose pending_action benefits from live health-factor data. */
const HF_TOOLS = new Set(['borrow', 'withdraw', 'save_deposit', 'repay_debt']);

/**
 * [Day 14c] Sub-cent debt is treated as no-debt for the projection math.
 * Mirrors the same `DEBT_DUST_USD` constant used by `serializeHf` /
 * `hfStatus` in `tools/health.ts` and the dust filter on per-asset
 * arrays in `transformHealthFactor`.
 */
const DEBT_DUST_USD = 0.01;

export interface PendingActionLiveData {
  borrowApyBps?: number;
  /** Finite HF when there's real debt; `null` for ∞ (no debt). */
  currentHF?: number | null;
  /**
   * [Day 14c] Projected HF after the pending write executes. Same
   * semantics as `currentHF`. `undefined` when we can't compute (e.g.
   * unknown liquidation threshold from a degraded NAVI response).
   */
  projectedHF?: number | null;
}

/**
 * [Day 14c] Project the new HF after a write action lands.
 *
 * HF formula (NAVI):  HF = (supplied × liquidationThreshold) / borrowed
 *
 * - `borrow X`         → newBorrowed = borrowed + X
 * - `repay_debt X`     → newBorrowed = max(0, borrowed - X)
 * - `withdraw X`       → newSupplied = max(0, supplied - X)
 * - `save_deposit X`   → newSupplied = supplied + X
 *
 * Both supported save/borrow assets (USDC + USDsui) are stables, so
 * treating `input.amount` as USD 1:1 is accurate to ±$0.01 — far below
 * any HF tier threshold (1.1 / 1.5 / 2.0). When the engine adds
 * non-stable saveable assets (none today), this needs a USD price
 * conversion.
 *
 * Returns `null` when projected position has no debt (∞), a finite
 * number when there's debt, or `undefined` when projection isn't
 * computable (missing liquidation threshold or non-positive amount).
 */
function projectHF(
  toolName: string,
  amount: number,
  supplied: number,
  borrowed: number,
  liquidationThreshold: number,
): number | null | undefined {
  if (!(amount > 0)) return undefined;
  if (!(liquidationThreshold > 0)) return undefined;

  let newSupplied = supplied;
  let newBorrowed = borrowed;
  switch (toolName) {
    case 'borrow':
      newBorrowed = borrowed + amount;
      break;
    case 'repay_debt':
      newBorrowed = Math.max(0, borrowed - amount);
      break;
    case 'withdraw':
      newSupplied = Math.max(0, supplied - amount);
      break;
    case 'save_deposit':
      newSupplied = supplied + amount;
      break;
    default:
      return undefined;
  }

  if (newBorrowed <= DEBT_DUST_USD) return null;
  return (newSupplied * liquidationThreshold) / newBorrowed;
}

export async function enrichPendingActionWithLiveData(
  toolName: string,
  input: unknown,
  context: ToolContext,
): Promise<PendingActionLiveData> {
  const needsBorrowApy = BORROW_APY_TOOLS.has(toolName);
  const needsHF = HF_TOOLS.has(toolName) && typeof context.walletAddress === 'string';

  if (!needsBorrowApy && !needsHF) return {};
  if (!context.mcpManager) return {};

  // `ToolContext.mcpManager` is typed as `unknown` in types.ts to avoid
  // a circular dependency on the MCP client module. Narrow it once here
  // so the two fetch calls below get proper typing.
  const manager = context.mcpManager as McpClientManager;

  const out: PendingActionLiveData = {};
  const work: Promise<unknown>[] = [];

  if (needsBorrowApy) {
    const inputObj = (input ?? {}) as Record<string, unknown>;
    const asset =
      typeof inputObj.asset === 'string' && inputObj.asset.length > 0 ? inputObj.asset : 'USDC';
    work.push(
      fetchRates(manager)
        .then((rates) => {
          // Case-insensitive lookup so 'usdc' / 'USDC' / 'Usdc' all match
          // NAVI's pool symbol casing ('USDC', 'USDsui', ...).
          const exact = rates[asset];
          const fallbackKey = exact
            ? undefined
            : Object.keys(rates).find((k) => k.toLowerCase() === asset.toLowerCase());
          const row = exact ?? (fallbackKey ? rates[fallbackKey] : undefined);
          if (row && Number.isFinite(row.borrowApy)) {
            // NAVI returns borrowApy as a decimal fraction (0.0467); audric's
            // APYBlock primitive consumes basis points (467). Convert here so
            // every consumer sees the same unit.
            out.borrowApyBps = Math.round(row.borrowApy * 10_000);
          }
        })
        .catch(() => {
          // Graceful degradation — leave field undefined.
        }),
    );
  }

  if (needsHF) {
    work.push(
      fetchHealthFactor(manager, context.walletAddress as string)
        .then((hf) => {
          // [Day 14c] HF semantics — `null` is the deliberate ∞ sentinel
          // (no debt = infinitely safe). Audric's HFRow handles both
          // `number` and `null`. Pre-14c we omitted the field when not
          // finite; 14c-shipped consumers (current + projected display)
          // need to distinguish "∞ before borrow" from "no data".
          out.currentHF = Number.isFinite(hf.healthFactor) ? hf.healthFactor : null;

          // [Day 14c] Projection — borrow / repay / withdraw / save_deposit
          // all change supplied or borrowed. Use the live position data
          // we already fetched (`supplied` / `borrowed` /
          // `liquidationThreshold`) + the input amount.
          const inputObj = (input ?? {}) as Record<string, unknown>;
          const amount =
            typeof inputObj.amount === 'number' ? inputObj.amount : 0;
          const projected = projectHF(
            toolName,
            amount,
            hf.supplied,
            hf.borrowed,
            hf.liquidationThreshold,
          );
          if (projected !== undefined) {
            out.projectedHF = projected;
          }
        })
        .catch(() => {
          // Graceful degradation
        }),
    );
  }

  await Promise.all(work);
  return out;
}
