// ---------------------------------------------------------------------------
// v2/enrich-pending-action.ts — stamp live NAVI data on pending_action
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Week 4 cleanup — Day 14a (2026-05-16).
//
// Reads the NAVI rates + health-factor caches at `pending_action` emit
// time and returns the `borrowApyBps` / `currentHF` fields to stamp on
// the PendingAction. Audric V2 components (BorrowPreviewBody,
// RepayPreviewBody, WithdrawPreviewBody, SavePreviewBody) detect these
// fields and render `APYBlock` + `HFGauge` primitives instead of the
// pre-Week-4 italic disclaimer + missing HF row.
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

export interface PendingActionLiveData {
  borrowApyBps?: number;
  currentHF?: number;
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
          if (Number.isFinite(hf.healthFactor)) {
            out.currentHF = hf.healthFactor;
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
