// ---------------------------------------------------------------------------
// tools/index.ts — tool registry (ToolSet shape, post-P4.1 Phase C)
// ---------------------------------------------------------------------------
//
// [SPEC AI SDK HARDENING P4.1 Phase C — 2026-05-25] After every in-tree
// tool migrated to AI SDK native `tool({...})`, this file stopped being
// a `Tool[]` registry and became a `ToolSet` (Record<name, AISDKTool>)
// registry. Three things drove the change:
//
//   1. The native `tool({...})` factory's output doesn't carry a `name`
//      field — names are the keys in a `ToolSet`. Storing tools in an
//      array required reintroducing the legacy `Tool` shape, defeating
//      the migration.
//   2. AI SDK's `streamText({ tools })` consumes `ToolSet` directly,
//      with no intermediate wrapping. The engine's `buildToolSet()`
//      now spreads `READ_TOOL_SET` + `WRITE_TOOL_SET` straight into
//      the agent.
//   3. The previous `applyToolFlags` indirection (legacy `Tool[]` →
//      flags-attached `Tool[]`) was dead at runtime: guards look up
//      flags by name via `getToolFlags(name)` regardless of any
//      per-instance `flags` field.
//
// Tool METADATA (flags, policy, modifiable fields) lives in sidecar
// registries keyed by name:
//   - `TOOL_FLAGS` (./tool-flags.ts)        — bundleability, mutating, etc.
//   - `TOOL_POLICY` (./v2/tool-policy.ts)   — permission level, cacheable
//   - `getModifiableFields` (./tools/tool-modifiable-fields.ts)
//
// The guard runner synthesizes a `GuardToolView` ({name, flags, preflight})
// per dispatch — it does NOT iterate this file.
//
// [SPEC_AUDRIC_DEFI_REMOVAL §2a/§2f — window-start cut, 2026-06-10]
// The user-facing DeFi surface was deleted from source (engine's sole
// consumer is the Audric host — "drop from the default set" = delete):
//   reads:  render_canvas (whole canvas subsystem), savings_info,
//           health_check, rates_info, yield_summary, pending_rewards,
//           explain_tx, portfolio_analysis, token_prices,
//           spending_analytics, activity_summary
//   writes: save_deposit, borrow, claim_rewards, harvest_rewards
// KEPT THROUGH THE 7-DAY EXIT WINDOW (cut after it closes — §2d):
//   withdraw, repay_debt, swap_execute (+ swap_quote: the read companion
//   stays as long as the verb does — guardSwapPreview fail-closes
//   swap_execute without a matching same-turn quote, so cutting the
//   quote first would brick the exit path the window exists for).
// Payment-link tools (create/list/cancel_payment_link) are RETAINED in
// the engine for Audric Store (the host drops them from its active set).
// SDK DeFi builders are untouched (§2b — host-surface removal, not an
// SDK deletion).
// ---------------------------------------------------------------------------

import type { ToolSet } from 'ai';
import { balanceCheckTool } from './balance.js';
import { transactionHistoryTool } from './history.js';
import { withdrawTool } from './withdraw.js';
import { sendTransferTool } from './transfer.js';
import { repayDebtTool } from './repay.js';
import { swapExecuteTool } from './swap.js';
import { swapQuoteTool } from './swap-quote.js';
import {
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
} from './receive.js';
import { resolveSuinsTool } from './resolve-suins.js';
import { mppServicesTool, mppCallTool } from './mpp.js';

// ---------------------------------------------------------------------------
// Tool name catalogues (single source of truth for "what's a read?",
// "what's a write?"). Hosts that need to iterate by capability use these
// instead of inspecting `TOOL_POLICY` entries one at a time.
// ---------------------------------------------------------------------------

export const READ_TOOL_NAMES = [
  'balance_check',
  'transaction_history',
  'swap_quote',
  'list_payment_links',
  'cancel_payment_link',
  'create_payment_link',
  'resolve_suins',
  'mpp_services',
] as const;

export const WRITE_TOOL_NAMES = [
  'withdraw',
  'send_transfer',
  'repay_debt',
  'swap_execute',
  'mpp_call',
] as const;

export type ReadToolName = (typeof READ_TOOL_NAMES)[number];
export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];
export type ToolName = ReadToolName | WriteToolName;

// ---------------------------------------------------------------------------
// ToolSet registries — pass directly to AI SDK `streamText({ tools })`
// ---------------------------------------------------------------------------

export const READ_TOOL_SET: ToolSet = {
  balance_check: balanceCheckTool,
  transaction_history: transactionHistoryTool,
  swap_quote: swapQuoteTool,
  list_payment_links: listPaymentLinksTool,
  cancel_payment_link: cancelPaymentLinkTool,
  create_payment_link: createPaymentLinkTool,
  resolve_suins: resolveSuinsTool,
  mpp_services: mppServicesTool,
};

export const WRITE_TOOL_SET: ToolSet = {
  withdraw: withdrawTool,
  send_transfer: sendTransferTool,
  repay_debt: repayDebtTool,
  swap_execute: swapExecuteTool,
  mpp_call: mppCallTool,
};

/**
 * The full default ToolSet — every in-tree read + write the engine
 * dispatches by default. Hosts that want a custom subset can spread
 * `READ_TOOL_SET` + their own writes, or pick by name from either set.
 *
 * Returns a fresh object on each call so host-side spread (`{ ...host,
 * ...getDefaultTools() }`) doesn't accidentally mutate shared state.
 */
export function getDefaultTools(): ToolSet {
  return { ...READ_TOOL_SET, ...WRITE_TOOL_SET };
}

export {
  balanceCheckTool,
  transactionHistoryTool,
  withdrawTool,
  sendTransferTool,
  repayDebtTool,
  swapExecuteTool,
  swapQuoteTool,
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  resolveSuinsTool,
  mppServicesTool,
  mppCallTool,
};
