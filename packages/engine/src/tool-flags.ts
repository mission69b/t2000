import type { Tool, ToolFlags } from './types.js';

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
 *   costAware       — has a monetary cost the user should know about
 *   maxRetries      — max calls with same input (default: unlimited for reads, 1 for writes)
 *   bundleable      — [SPEC 7 Layer 2] can participate in a multi-write Payment Stream
 *                     PTB. Set on every confirm-tier write whose on-chain effect is
 *                     fully expressible at compose time. Excluded: `pay_api` (recipient/
 *                     amount/currency unknown until gateway 402 challenge resolves at
 *                     route time) and `save_contact` (Postgres-only, no on-chain effect).
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
  volo_stake:      { mutating: true, requiresBalance: true, bundleable: true },
  volo_unstake:    { mutating: true, bundleable: true },

  // Write tools — pay / services (NOT bundleable — see ToolFlags.bundleable JSDoc)
  pay_api:         { mutating: true, requiresBalance: true, costAware: true, producesArtifact: true, maxRetries: 1 },

  // Write tools — lightweight (no financial guards, NOT bundleable — Postgres only)
  save_contact:    {},

  // [SIMPLIFICATION DAY 7] Removed flag entries for deleted tools:
  //   create_schedule, cancel_schedule (DCA schedules retired)
  //   toggle_allowance, update_daily_limit, update_permissions (allowance dormant)

  // Receive tools — create/cancel mutate server state
  create_payment_link: { mutating: true },
  cancel_payment_link: { mutating: true },
  create_invoice:      { mutating: true },
  cancel_invoice:      { mutating: true },
};

/**
 * Apply flags from the central registry to a tool array.
 * Tools not in the registry get empty flags (read-only tools).
 */
export function applyToolFlags<T extends Tool>(tools: T[]): T[] {
  return tools.map((tool) => {
    const flags = TOOL_FLAGS[tool.name];
    if (!flags) return tool;
    return { ...tool, flags: { ...tool.flags, ...flags } };
  });
}

/**
 * Get flags for a tool by name. Returns empty flags if not registered.
 */
export function getToolFlags(name: string): ToolFlags {
  return TOOL_FLAGS[name] ?? {};
}

/**
 * [SPEC 7 P2.5 Layer 4] True if this tool is in the v1 bundleable set.
 *
 * Used by the recipe loader's `bundle: true` validation — recipes that
 * declare `bundle: true` on a step MUST point to a tool that returns
 * `true` here. The set is the 9 confirm-tier write tools whose on-chain
 * effect is fully expressible at compose time:
 *
 *   save_deposit, withdraw, borrow, repay_debt, send_transfer,
 *   swap_execute, claim_rewards, volo_stake, volo_unstake.
 */
export function isBundleableTool(name: string): boolean {
  return TOOL_FLAGS[name]?.bundleable === true;
}
