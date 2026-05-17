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

/**
 * [Day 14d / 2026-05-17] Defensive amount coercion.
 *
 * `cached.input.amount` reaches enrichment BEFORE the tool's Zod schema
 * validates it. The LLM occasionally emits numeric fields as strings
 * (`"0.5"` instead of `0.5`) — Anthropic's JSON-mode is not 100%
 * strict about types when the schema parameter doc says
 * "Amount to borrow". Pre-Day-14d the strict `typeof === 'number'`
 * check coerced these strings to `0`, which then propagated into
 * `projectHF` and returned `null` (no-debt projection) instead of
 * the real projected HF.
 *
 * Returns `0` when the input is non-numeric or non-positive — the
 * downstream `projectHF` first guard `!(amount > 0)` catches `0` and
 * returns `undefined`, hiding the HF row entirely. That's preferable
 * to silently rendering a misleading "∞ → ∞" preview.
 */
function coerceAmount(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

/**
 * [Day 14d / 2026-05-17] Coerce currentHF to `null` when the user has
 * no real debt, regardless of what NAVI's `healthFactor` field reports.
 *
 * Root cause this fixes: after a repay, NAVI's indexer occasionally
 * leaves residual sub-dust borrow rows for ~30-60s. `fetchHealthFactor`
 * returns `borrowed: 0.0001` + `healthFactor: 0` (NAVI's literal value
 * when the field is unset / liquidation-like), and `transformHealthFactor`
 * falls through to `(borrowed === 0 ? Infinity : 0)` — that branch
 * returns `0` for the dust case, which then renders as a misleading
 * "Health factor 0.00" (looks like liquidation imminent).
 *
 * By treating `borrowed <= DEBT_DUST_USD` as no-debt for the preview
 * display, the row correctly shows `∞` — matching what `transformHealthFactor`
 * would emit if NAVI returned `borrowed === 0` exactly.
 */
function coerceCurrentHF(healthFactor: number, borrowed: number): number | null {
  if (borrowed <= DEBT_DUST_USD) return null;
  if (!Number.isFinite(healthFactor)) return null;
  return healthFactor;
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
      // [Day 14d / 2026-05-17] Preview HF MUST be fresh — `skipCache: true`
      // bypasses the 30s naviKey.health TTL. Without this, a preview
      // emitted within 30s of a prior write reads stale position data
      // (residual dust borrow / pre-deposit supplied), which then
      // poisons both `currentHF` and `projectedHF`. The preview is
      // shown ONCE before the user taps Approve; the latency cost
      // (~100-300ms cache miss vs <5ms cache hit) is worth correctness
      // on the single most safety-critical pre-write surface.
      fetchHealthFactor(manager, context.walletAddress as string, { skipCache: true })
        .then((hf) => {
          // [Day 14d] HF semantics — `null` is the deliberate ∞ sentinel
          // (no debt = infinitely safe). `coerceCurrentHF` treats sub-dust
          // borrowed as no-debt regardless of NAVI's literal `healthFactor`
          // field, fixing the post-repay indexer-lag edge case where NAVI
          // returned `0` instead of `Infinity`. Audric's HFRow handles
          // both `number` and `null`.
          out.currentHF = coerceCurrentHF(hf.healthFactor, hf.borrowed);

          // [Day 14d] Projection — borrow / repay / withdraw / save_deposit
          // all change supplied or borrowed. Use the live position data
          // we already fetched (`supplied` / `borrowed` /
          // `liquidationThreshold`) + the input amount. `coerceAmount`
          // handles the LLM-emits-string edge case so projection isn't
          // silently dropped to `null`.
          const inputObj = (input ?? {}) as Record<string, unknown>;
          const amount = coerceAmount(inputObj.amount);
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
