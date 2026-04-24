import type { ThinkingEffort } from './types.js';
import type { Recipe } from './recipes/index.js';

/**
 * Routes each turn to the appropriate thinking effort level based on
 * message content, matched recipe, and session write history.
 *
 * Heuristics only — no LLM call. Cost per session becomes proportional
 * to actual query complexity rather than a fixed budget.
 */
export function classifyEffort(
  model: string,
  userMessage: string,
  matchedRecipe: Recipe | null,
  sessionWriteCount: number,
): ThinkingEffort {
  const supportsMax = model.includes('opus-4-6');
  const msg = userMessage.toLowerCase();

  if (supportsMax) {
    if (matchedRecipe?.name === 'portfolio_rebalance') return 'max';
    if (matchedRecipe?.name === 'emergency_withdraw') return 'max';
    if (/rebalance|reallocate|dca setup|close.*position/i.test(msg)) return 'max';
  }

  if (matchedRecipe && matchedRecipe.steps.length >= 3) return 'high';
  if (matchedRecipe?.name === 'safe_borrow' || matchedRecipe?.name === 'bulk_mail') return 'high';
  if (sessionWriteCount > 0 && /borrow|withdraw|send|swap/i.test(msg)) return 'high';

  // Any matched recipe means multi-step tool work — never route to Haiku
  // regardless of message wording. Haiku struggles with the synthesis these
  // recipes require and ends up looping through more tool rounds than Sonnet,
  // costing more in practice. (Confirmed by 0.46.x TurnMetrics baseline:
  // low-effort Haiku turns averaged $0.040 vs $0.017 for medium-effort Sonnet.)
  if (matchedRecipe) return 'medium';

  // Pure simple lookups — single-fact questions Haiku handles well.
  // Explicitly excludes `show|history|all|list|everything` which imply
  // multi-record synthesis (the original regex sent these to Haiku and
  // they bottomed out the cost/latency curves).
  if (/\b(balance|rate|how much|what is|check|price|apy|hf)\b/i.test(msg)) return 'low';
  if (!/\b(deposit|send|swap|borrow|withdraw|save|pay|transfer|show|history|all|list|everything|report|summary|breakdown)\b/i.test(msg)) return 'low';

  return 'medium';
}
