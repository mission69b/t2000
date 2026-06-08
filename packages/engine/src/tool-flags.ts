import type { ToolFlags } from './types.js';

/**
 * Central registry of tool flags for the guard runner (RE-2.2).
 *
 * Flags are declarative metadata that guards read to decide what checks to run.
 * Read-only tools have no flags by default (empty object).
 *
 * Flag meanings:
 *   mutating        — changes on-chain state (deposit, swap, send, borrow)
 *   requiresBalance — needs sufficient funds to execute
 *   affectsHealth   — can change borrow health factor
 *   irreversible    — physical mail, external transfers — can't undo
 *   producesArtifact — returns images, documents, generated content
 *                     (no current consumer; reserved for Audric Store
 *                     primitives in the upcoming Commerce SPEC)
 *   maxRetries      — max calls with same input (default: unlimited for reads, 1 for writes)
 *   bundleable      — [SPEC 7 Layer 2] can participate in a multi-write Payment
 *                     Intent. Set on every confirm-tier write whose on-chain effect
 *                     is fully expressible at compose time.
 */
export const TOOL_FLAGS: Record<string, ToolFlags> = {
  // Write tools — financial (bundleable — SPEC 7 Layer 2)
  save_deposit:    { mutating: true, requiresBalance: true, bundleable: true },
  withdraw:        { mutating: true, affectsHealth: true, bundleable: true },
  send_transfer:   { mutating: true, requiresBalance: true, irreversible: true, bundleable: true },
  swap_execute:    { mutating: true, requiresBalance: true, bundleable: true },
  borrow:          { mutating: true, affectsHealth: true, bundleable: true },
  repay_debt:      { mutating: true, requiresBalance: true, bundleable: true },
  claim_rewards:   { mutating: true, bundleable: true },
  harvest_rewards: { mutating: true, requiresBalance: true, bundleable: true },

  // [SIMPLIFICATION DAY 7] Removed flag entries for deleted tools:
  //   create_schedule, cancel_schedule (DCA schedules retired)
  //   toggle_allowance, update_daily_limit, update_permissions (allowance dormant)
  // [S.269 item 6 — 2026-05-23] Removed flag entry for deleted save_contact
  //   (dead tool — host-side Prisma persistence, no engine effect).
  // [S.277 — 2026-05-23] Engine-side flag entries for Volo trio removed
  //   (volo_stake, volo_unstake — "Earns Its Keep" audit).
  // [S.323 — 2026-05-25] Volo fully removed from SDK + CLI + MCP. vSUI
  //   remains as a passive token (NAVI reward, Cetus swap target) but
  //   no mint/redeem surfaces exist anywhere in the t2000 stack.

  // Receive tools — create/cancel mutate server state
  create_payment_link: { mutating: true },
  cancel_payment_link: { mutating: true },

  // MPP — paying for a Service spends USDC (mutating). Not bundleable: a
  // paid API call isn't part of an on-chain Payment Intent PTB.
  mpp_call: { mutating: true },
};

/**
 * Get flags for a tool by name. Returns empty flags if not registered.
 *
 * [P4.1 / v3.0.0 / 2026-05-25] `applyToolFlags(tools: Tool[]): Tool[]`
 * was removed — every tool is now a native AI SDK `tool()` and reads
 * flags by name from this registry at the engine's guard-runner site.
 */
export function getToolFlags(name: string): ToolFlags {
  return TOOL_FLAGS[name] ?? {};
}

/**
 * [SPEC 7 P2.5 Layer 4] True if this tool is in the v1 bundleable set.
 *
 * [v0.7a Phase 6 — 2026-05-17] Was originally used by the now-deleted
 * recipe loader's `bundle: true` validation. Still exported because the
 * runtime permission gate (`compose-bundle.ts`) uses it to fail-close
 * when the LLM emits parallel `tool_use` blocks for non-bundleable
 * tools. Skill prose tells the LLM which tools are bundleable in the
 * "PAYMENT INTENT" sections (see `t2000-rebalance` / `t2000-save` /
 * `t2000-withdraw` SKILL.md files).
 *
 * The set is the 7 confirm-tier write tools whose on-chain effect is
 * fully expressible at compose time (post-S.277; Volo trio cut):
 *
 *   save_deposit, withdraw, borrow, repay_debt, send_transfer,
 *   swap_execute, claim_rewards.
 */
export function isBundleableTool(name: string): boolean {
  return TOOL_FLAGS[name]?.bundleable === true;
}
