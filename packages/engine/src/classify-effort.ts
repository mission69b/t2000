import type { ThinkingEffort } from './types.js';

/**
 * Routes each turn to the appropriate thinking effort level based on
 * message content + session write history.
 *
 * Heuristics only — no LLM call. Cost per session becomes proportional
 * to actual query complexity rather than a fixed budget.
 *
 * SPEC v0.7a Phase 6 (D-4 a) — locked at HYBRID 2026-05-17. Previously
 * accepted a `matchedRecipe` arg that boosted effort based on recipe
 * name / step count. Recipes were deleted in Phase 6; the boost paths
 * migrated to message regex (which is a tighter approximation to user
 * intent than the recipe registry — recipes matched on `triggers:`
 * arrays anyway). Skill registries are NOT consulted here — skill
 * matching is a runtime LLM concern that runs AFTER effort is allocated.
 * See `v07a-phase-6-spec.md` for the layer-mental-model rationale.
 */
export function classifyEffort(
  model: string,
  userMessage: string,
  sessionWriteCount: number,
): ThinkingEffort {
  const supportsMax = model.includes('opus-4-6');
  const msg = userMessage.toLowerCase();

  if (supportsMax) {
    // [SPEC 30 Phase 1B.5 — 2026-05-14] CodeQL `js/polynomial-redos`:
    // `close.*position` was flagged for unbounded `.*` backtracking on
    // `close`-repeated inputs. Bounded to ≤50 chars (lazy) — the legit
    // intent ("close my SUI position", "close all leveraged positions")
    // fits comfortably under 50; longer matches were never routed by
    // this branch anyway. Lazy `.{0,50}?` is linear-time.
    if (/rebalance|reallocate|dca setup|close.{0,50}?position/i.test(msg)) return 'max';
  }

  // Rebalance / emergency-withdraw shape → high on non-opus (max already
  // on opus above). Was previously `matchedRecipe?.name === 'portfolio_rebalance'`
  // and `'emergency_withdraw'` recipe boosts; absorbed here as message regex.
  if (/\b(rebalance|reallocate)\b/i.test(msg)) return 'high';
  if (/close\s+(my\s+)?position|emergency\s+withdraw|withdraw\s+(all|everything)/i.test(msg)) return 'high';

  // Multi-tool account-report synthesis. Was previously
  // `matchedRecipe.steps.length >= 3` (account_report had 7 steps).
  if (/\b(full report|account summary|account report|complete (overview|breakdown)|everything about (my|the))\b/i.test(msg)) return 'high';

  // Safe-borrow shape — explicit safety language around borrow. Was
  // previously `matchedRecipe?.name === 'safe_borrow'` boost.
  // NOTE: `safe(ly)?` not `safely?` — the latter would only optional-y
  // off "safel", missing the literal "safe borrow" phrasing.
  if (/\b(safe(ly)?\s+borrow|borrow\s+against\s+(my\s+)?(savings|collateral))\b/i.test(msg)) return 'high';

  // Swap-and-save bundled intent — was previously `swap_and_save` recipe boost.
  if (/swap\s+\w+\s+(and|then)\s+save|swap\s+and\s+save|convert\s+\w+\s+(and|then)\s+deposit/i.test(msg)) return 'high';

  // Bulk-mail / batch-send shape. Was previously `bulk_mail` recipe boost.
  if (/\bbulk\s+(send|mail|transfer)\b/i.test(msg)) return 'high';

  if (sessionWriteCount > 0 && /borrow|withdraw|send|swap/i.test(msg)) return 'high';

  // [F-14 / 2026-05-18] Explicit deep-reasoning markers ALWAYS upgrade to
  // medium, BEFORE the single-fact-lookup short-circuit below. Pre-F-14, a
  // prompt like "Should I save 5 USDC into NAVI? Walk me through your
  // reasoning step by step, weighing the APY vs my portfolio composition
  // and any risks" got mis-routed to `low` (Haiku, no thinking) because
  // it mentioned "apy" — even though it explicitly asked for multi-step
  // reasoning + trade-off analysis. The cost of this mis-classification
  // was hidden pre-F-13 (no extended thinking anywhere); now that F-13 is
  // restored, classifier accuracy directly determines whether deep prompts
  // get Anthropic structured-thinking output or fall back to inline
  // `<thinking>` text tags from Haiku.
  //
  // Markers chosen are intent-bearing, not topical — they signal the
  // USER wants reasoning shown, not just a fact lookup. False-positive
  // cost is low (occasional Sonnet routing for a borderline prompt);
  // false-negative cost is high (Sonnet+thinking budget wasted on a
  // model that can't use it).
  if (/\b(walk me through|step.?by.?step|show.{0,20}reasoning|trade.?offs?|weigh.{0,20}(against|risks?|alternatives?|options?)|reason\s+(through|about))\b/i.test(msg)) {
    return 'medium';
  }

  // Pure simple lookups — single-fact questions Haiku handles well.
  // Explicitly excludes `show|history|all|list|everything` which imply
  // multi-record synthesis (the original regex sent these to Haiku and
  // they bottomed out the cost/latency curves).
  if (/\b(balance|rate|how much|what is|check|price|apy|hf)\b/i.test(msg)) return 'low';
  if (!/\b(deposit|send|swap|borrow|withdraw|save|pay|transfer|show|history|all|list|everything|report|summary|breakdown)\b/i.test(msg)) return 'low';

  return 'medium';
}
