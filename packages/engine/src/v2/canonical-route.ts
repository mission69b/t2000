// ───────────────────────────────────────────────────────────────────────────
// Canonical route block — LLM narration grounding for confirmed swaps.
//
// Restored from the deleted QueryEngine (commit f87d7329, v2.0.0 cleanup)
// because v2's bundle-resume path needs the same SPEC 20.2 protection
// against stale-route narration. The original lived in the now-deleted
// `packages/engine/src/engine.ts`; this file is the v2 home and is
// imported only by `v2/engine.ts:resumeWithToolResult`.
//
// What the block does:
//   When a swap_execute leg in a single-write or bundle resume succeeds,
//   we append a `<canonical_route>...` text block to the user message that
//   carries the tool_result. It tells the LLM the EXACT path the swap
//   took on-chain so the narration cites that path, not a stale path from
//   a prior swap_quote (which can differ when the aggregator picks a
//   different route at execute time).
//
// Why per-leg success gating matters (SPEC 20.2 D-4b):
//   Pre-fix, the block was emitted whenever the user clicked Confirm —
//   even when the bundle reverted at sponsor/dry-run/on-chain. The block
//   acts as a strong directive ("The user just approved a swap. The
//   CANONICAL route taken on-chain is...") and overrode the failed
//   tool_results in the same user message, causing the LLM to narrate
//   "executed atomically" for a tx that never reached chain. Production
//   smoke 2026-05-09 (session s_1778363976666_bc618ba691bb) recorded one
//   such money-trust failure. Fix: only inject for swap legs whose
//   tool_result is NOT an error.
// ───────────────────────────────────────────────────────────────────────────

import type { PendingAction, PermissionResponse } from '../types.js';

export function buildCanonicalRouteText(
  action: PendingAction,
  response: PermissionResponse,
): string | null {
  const failedToolUseIds = new Set<string>();
  if (Array.isArray(action.steps) && action.steps.length > 0) {
    const stepResultByToolUseId = new Map(
      (response.stepResults ?? []).map((sr) => [sr.toolUseId, sr]),
    );
    for (const step of action.steps) {
      const sr = stepResultByToolUseId.get(step.toolUseId);
      if (!sr || sr.isError === true) {
        failedToolUseIds.add(step.toolUseId);
      }
    }
  } else if (isExecutionResultFailure(response.executionResult)) {
    failedToolUseIds.add(action.toolUseId);
  }

  const swaps: Array<{
    input: unknown;
    cetusRoute: NonNullable<PendingAction['cetusRoute']>;
  }> = [];

  if (Array.isArray(action.steps) && action.steps.length > 0) {
    for (const step of action.steps) {
      if (step.toolName === 'swap_execute' && step.cetusRoute) {
        if (failedToolUseIds.has(step.toolUseId)) continue;
        swaps.push({ input: step.input, cetusRoute: step.cetusRoute });
      }
    }
  } else if (action.toolName === 'swap_execute' && action.cetusRoute) {
    if (!failedToolUseIds.has(action.toolUseId)) {
      swaps.push({ input: action.input, cetusRoute: action.cetusRoute });
    }
  }

  if (swaps.length === 0) return null;

  const blocks = swaps.map(({ input, cetusRoute }) => {
    const inp = input as { from?: string; to?: string; amount?: number } | null;
    const providers = cetusRoute.routerData.paths
      .map((p) => p.provider)
      .filter(Boolean)
      .slice(0, 5);
    const providerLine =
      providers.length > 0 ? providers.join(' + ') : 'Cetus Aggregator';
    const impactPct = (cetusRoute.priceImpact * 100).toFixed(3);
    return [
      '<canonical_route>',
      `The user just approved a swap. The CANONICAL route taken on-chain is:`,
      `- Pair: ${inp?.from ?? '?'} → ${inp?.to ?? '?'}`,
      `- Path: ${providerLine}`,
      `- Price impact: ${impactPct}%`,
      `When narrating this swap, cite this EXACT path string. Do NOT reference any prior swap_quote that produced a different route — that quote is no longer canonical.`,
      '</canonical_route>',
    ].join('\n');
  });

  return blocks.join('\n\n');
}

/**
 * Heuristic: does this single-write `executionResult` payload represent a
 * failure?
 *
 * The engine's single-write tool_result block is hardcoded to
 * `isError: false` — so we can't use that flag. Instead we sniff the
 * payload shape for any of the known failure tells:
 *
 * - `success: false` (audric's executeToolAction shape on catch)
 * - `error` key present (audric's generic catch shape)
 * - `_bundleReverted: true` (atomic Payment Intent revert)
 * - `_sessionExpired: true` (Enoki zkLogin JWT expired)
 * - `_txReverted: true` (reserved for future on-chain revert sentinel)
 *
 * Conservative-by-design: when we can't tell, return false (treat as
 * success). Wrong-direction failure here would suppress the
 * canonical_route block on a successful swap; the LLM would still
 * narrate from the success-shaped tool_result, just without the
 * route-grounding block. Wrong-direction success would re-introduce the
 * narration-lie bug, which is what we're fixing.
 */
export function isExecutionResultFailure(executionResult: unknown): boolean {
  if (executionResult === null || executionResult === undefined) return false;
  if (typeof executionResult !== 'object') return false;
  const er = executionResult as Record<string, unknown>;
  if (er.success === false) return true;
  if (typeof er.error === 'string' && er.error.length > 0) return true;
  if (er._bundleReverted === true) return true;
  if (er._sessionExpired === true) return true;
  if (er._txReverted === true) return true;
  if (er.data && typeof er.data === 'object') {
    const d = er.data as Record<string, unknown>;
    if (typeof d.error === 'string' && d.error.length > 0) return true;
    if (d._bundleReverted === true) return true;
    if (d._sessionExpired === true) return true;
    if (d._txReverted === true) return true;
  }
  return false;
}
