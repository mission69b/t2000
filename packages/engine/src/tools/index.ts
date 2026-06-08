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
// ---------------------------------------------------------------------------

import type { ToolSet } from 'ai';
import { balanceCheckTool } from './balance.js';
import { savingsInfoTool } from './savings.js';
import { healthCheckTool } from './health.js';
import { ratesInfoTool } from './rates.js';
import { transactionHistoryTool } from './history.js';
import { saveDepositTool } from './save.js';
import { withdrawTool } from './withdraw.js';
import { sendTransferTool } from './transfer.js';
import { borrowTool } from './borrow.js';
import { repayDebtTool } from './repay.js';
import { claimRewardsTool } from './claim.js';
import { swapExecuteTool } from './swap.js';
import { swapQuoteTool } from './swap-quote.js';
import { explainTxTool } from './explain-tx.js';
import { portfolioAnalysisTool } from './portfolio-analysis.js';
import {
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
} from './receive.js';
import { renderCanvasTool } from './canvas.js';
import { spendingAnalyticsTool } from './spending.js';
import { yieldSummaryTool } from './yield-summary.js';
import { activitySummaryTool } from './activity-summary.js';
import { resolveSuinsTool } from './resolve-suins.js';
import { pendingRewardsTool } from './pending-rewards.js';
import { harvestRewardsTool, narrateHarvestResult } from './harvest-rewards.js';
import { tokenPricesTool } from './token-prices.js';
import { mppServicesTool, mppCallTool } from './mpp.js';

// ---------------------------------------------------------------------------
// Tool name catalogues (single source of truth for "what's a read?",
// "what's a write?"). Hosts that need to iterate by capability use these
// instead of inspecting `TOOL_POLICY` entries one at a time.
// ---------------------------------------------------------------------------

export const READ_TOOL_NAMES = [
  'render_canvas',
  'balance_check',
  'savings_info',
  'health_check',
  'rates_info',
  'transaction_history',
  'swap_quote',
  'explain_tx',
  'portfolio_analysis',
  'token_prices',
  'list_payment_links',
  'cancel_payment_link',
  'create_payment_link',
  'spending_analytics',
  'yield_summary',
  'activity_summary',
  'resolve_suins',
  'pending_rewards',
  'mpp_services',
] as const;

export const WRITE_TOOL_NAMES = [
  'save_deposit',
  'withdraw',
  'send_transfer',
  'borrow',
  'repay_debt',
  'claim_rewards',
  'harvest_rewards',
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
  render_canvas: renderCanvasTool,
  balance_check: balanceCheckTool,
  savings_info: savingsInfoTool,
  health_check: healthCheckTool,
  rates_info: ratesInfoTool,
  transaction_history: transactionHistoryTool,
  swap_quote: swapQuoteTool,
  explain_tx: explainTxTool,
  portfolio_analysis: portfolioAnalysisTool,
  token_prices: tokenPricesTool,
  list_payment_links: listPaymentLinksTool,
  cancel_payment_link: cancelPaymentLinkTool,
  create_payment_link: createPaymentLinkTool,
  spending_analytics: spendingAnalyticsTool,
  yield_summary: yieldSummaryTool,
  activity_summary: activitySummaryTool,
  resolve_suins: resolveSuinsTool,
  pending_rewards: pendingRewardsTool,
  mpp_services: mppServicesTool,
};

export const WRITE_TOOL_SET: ToolSet = {
  save_deposit: saveDepositTool,
  withdraw: withdrawTool,
  send_transfer: sendTransferTool,
  borrow: borrowTool,
  repay_debt: repayDebtTool,
  claim_rewards: claimRewardsTool,
  harvest_rewards: harvestRewardsTool,
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
  renderCanvasTool,
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
  saveDepositTool,
  withdrawTool,
  sendTransferTool,
  borrowTool,
  repayDebtTool,
  claimRewardsTool,
  swapExecuteTool,
  swapQuoteTool,
  explainTxTool,
  portfolioAnalysisTool,
  tokenPricesTool,
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
  resolveSuinsTool,
  pendingRewardsTool,
  harvestRewardsTool,
  narrateHarvestResult,
  mppServicesTool,
  mppCallTool,
};
