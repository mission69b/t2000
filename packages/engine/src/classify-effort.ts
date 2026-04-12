import type { ThinkingEffort } from './types.js';

interface Recipe {
  name: string;
  steps: unknown[];
}

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

  if (/balance|rate|how much|what is|check|history|show|price/i.test(msg)) return 'low';
  if (!matchedRecipe && !/deposit|send|swap|borrow|withdraw|save|pay/i.test(msg)) return 'low';

  return 'medium';
}
