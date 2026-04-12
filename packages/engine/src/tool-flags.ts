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
 */
export const TOOL_FLAGS: Record<string, ToolFlags> = {
  // Write tools — financial
  save_deposit:    { mutating: true, requiresBalance: true },
  withdraw:        { mutating: true, affectsHealth: true },
  send_transfer:   { mutating: true, requiresBalance: true, irreversible: true },
  swap_execute:    { mutating: true, requiresBalance: true },
  borrow:          { mutating: true, affectsHealth: true },
  repay_debt:      { mutating: true, requiresBalance: true },
  claim_rewards:   { mutating: true },
  volo_stake:      { mutating: true, requiresBalance: true },
  volo_unstake:    { mutating: true },

  // Write tools — pay / services
  pay_api:         { mutating: true, requiresBalance: true, costAware: true, producesArtifact: true, maxRetries: 1 },

  // Write tools — lightweight (no financial guards)
  save_contact:    {},
  create_schedule: { mutating: true },
  cancel_schedule: { mutating: true },

  // Allowance tools — API mutations disguised as reads
  toggle_allowance:   { mutating: true },
  update_daily_limit: { mutating: true },
  update_permissions: { mutating: true },

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
