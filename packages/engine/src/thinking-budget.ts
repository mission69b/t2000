import type { ThinkingConfig, ThinkingEffort } from './types.js';

// ---------------------------------------------------------------------------
// Per-shape thinking-budget HARD caps (SPEC 8 v0.5.1, P3.2 slice 5)
//
// The 4 harness shapes (`lean` / `standard` / `rich` / `max`) correspond
// 1-to-1 with the 4 ThinkingEffort tiers (`low` / `medium` / `high` /
// `max`). Each tier carries a hard ceiling on `thinking.budget_tokens`
// that hosts cannot exceed via direct config — the engine clamps before
// calling the provider.
//
// Why HARD caps:
// - Cost ceiling enforced even if a host misconfigures `budgetTokens`
// - LEAN tier (low effort) MUST emit zero thinking blocks per spec — a
//   non-zero budget would produce drift between the spec's promise
//   ("LEAN turns feel instant") and reality
// - Acceptance gates in P3.6 reference these exact caps; codifying them
//   here means the gates and the enforcement share a source of truth
//
// The host can pass a SMALLER budget — these are caps, not floors. A host
// that wants `medium=4_000` keeps that; the engine never raises it.
// ---------------------------------------------------------------------------

export const EFFORT_THINKING_BUDGET_CAPS: Record<ThinkingEffort, number | null> = {
  // null = thinking force-disabled (LEAN tier — single-fact reads need
  // zero deliberation; a thinking block here adds ~300ms TTFVP for no
  // benefit — see SPEC 8 § "Decision 2: LEAN shape: zero thinking blocks")
  low: null,
  medium: 8_000,
  high: 16_000,
  max: 32_000,
};

/**
 * Clamp a `ThinkingConfig` to the HARD cap for the given effort tier.
 *
 * - When `effort === 'low'`, returns `{ type: 'disabled' }` regardless of
 *   input — LEAN tier is non-negotiable.
 * - When `config.type === 'enabled'` and `config.budgetTokens` exceeds
 *   the cap, returns a copy with `budgetTokens` clamped down.
 * - When `config.type === 'adaptive'`, returns it unchanged — adaptive
 *   mode is shape-agnostic by design (Anthropic decides per-turn).
 * - When `effort` is undefined, returns `config` unchanged — caller
 *   hasn't classified the turn yet (back-compat for hosts that don't
 *   route on effort).
 *
 * This function is pure and side-effect-free; safe to call per-turn.
 */
export function clampThinkingForEffort(
  config: ThinkingConfig | undefined,
  effort: ThinkingEffort | undefined,
): ThinkingConfig | undefined {
  if (!config) return config;
  if (effort === undefined) return config;
  const cap = EFFORT_THINKING_BUDGET_CAPS[effort];
  if (cap === null) {
    return { type: 'disabled' };
  }
  if (config.type === 'enabled' && config.budgetTokens > cap) {
    return { ...config, budgetTokens: cap };
  }
  return config;
}
