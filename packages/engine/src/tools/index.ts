import type { Tool } from '../types.js';
import { applyToolFlags } from '../tool-flags.js';
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
import { voloStakeTool } from './volo-stake.js';
import { voloUnstakeTool } from './volo-unstake.js';
import { voloStatsTool } from './volo-stats.js';
import { webSearchTool } from './web-search.js';
import { explainTxTool } from './explain-tx.js';
import { portfolioAnalysisTool } from './portfolio-analysis.js';
import { protocolDeepDiveTool } from './protocol-deep-dive.js';
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
// [S18-F20] Read-only inspector for pending NAVI lending rewards.
// Companion to claim_rewards (read → write split) so the LLM can
// disclose what's claimable BEFORE asking for a confirm card.
// Also feeds the harvest_rewards compound tool.
import { pendingRewardsTool } from './pending-rewards.js';
// [Track B / 2026-05-08] Compound write — claim NAVI rewards, swap each
// non-USDC reward to USDC inline, deposit to NAVI savings. Single PTB,
// single confirm card, atomic settlement. Powers the audric "🌾 HARVEST"
// chip under Save.
import { harvestRewardsTool, narrateHarvestResult } from './harvest-rewards.js';
// [SPEC 8 v0.5.1] update_todo is opt-in — NOT included in READ_TOOLS.
// Hosts adopt by appending `updateTodoTool` to their tool list:
//   tools: [...getDefaultTools(), updateTodoTool]
// This keeps the existing audric/web call sites zero-risk until the
// SPEC 8 host wiring (P3.3) lands.
import { updateTodoTool } from './update-todo.js';
// [SPEC 9 v0.1.3 P9.4] add_recipient is opt-in for the same reason —
// hosts that don't yet render `pending_input` forms shouldn't expose
// the tool to the LLM (they'd receive an event they can't handle).
// Adopt by appending `addRecipientTool` to the tool list:
//   tools: [...getDefaultTools(), addRecipientTool]
// Once audric's form renderer + resume endpoint ship, audric/web
// adopts; other hosts follow when ready.
import { addRecipientTool } from './add-recipient.js';
// [v1.4 — Day 3] All 7 `defillama_*` LLM tools removed. The
// BlockVision-backed `token_prices` tool covers spot prices; the
// surviving DefiLlama dependency is `protocol_deep_dive`, which holds
// onto its own `api.llama.fi` calls (TVL/fees/audit metadata) and is
// the lone production consumer of the upstream API. See
// AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md §"Day 3" for context.
import { tokenPricesTool } from './token-prices.js';

// [SIMPLIFICATION DAY 7] Removed 9 tools to align engine with chat-first thesis:
//   - allowance_status, toggle_allowance, update_daily_limit, update_permissions
//     (allowance contract dormant; agent autonomy under zkLogin was theatre)
//   - create_schedule, list_schedules, cancel_schedule
//     (DCA/scheduled actions can't execute without user online to sign)
//   - pause_pattern, pattern_status
//     (pattern detection as proposals removed; classifiers stay as pure fns)
//
// [v1.4 — Day 3] All 7 defillama_* LLM tools deleted (Day 2: prices/
// change → BlockVision; Day 3: yield-pools/protocol-info/chain-tvl/
// protocol-fees/sui-protocols deleted, no replacement). v1.4 left the
// engine at 23 reads + 11 writes = 34 tools. SPEC 10 (May 2026) added
// resolve_suins (→ 24 reads / 35 total). S.119 added pending_rewards
// + Track B added harvest_rewards → bumped to 25 reads + 12 writes = 37.
// [S.245 — 2026-05-22] V07E_D_QUESTION_AUDITS D-2 reframe deleted
// pay_api + mpp_services from the engine entirely. Capabilities return
// as Commerce primitives in Audric Store SPEC (clean-slate redesign,
// not a port). 35 tools.
// [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] Deleted 3
// invoice tools (create_invoice / list_invoices / cancel_invoice) +
// InvoiceSchema from receive.ts. Payment links cover the invoicing
// use case (set label/memo to encode invoice context). The 3
// payment-link tools have been re-described to handle any invoice
// intent the LLM sees.
// [S.269 item 6 — 2026-05-23] save_contact tool deleted (was a dead
// host-side write). WRITE_TOOLS dropped from 11 → 10.
// **Current count: 21 reads + 10 writes = 31 tools.**

export const READ_TOOLS: Tool[] = [
  renderCanvasTool,
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
  swapQuoteTool,
  voloStatsTool,
  webSearchTool,
  explainTxTool,
  portfolioAnalysisTool,
  protocolDeepDiveTool,
  tokenPricesTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  createPaymentLinkTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
  resolveSuinsTool,
  pendingRewardsTool,
];

export const WRITE_TOOLS: Tool[] = [
  saveDepositTool,
  withdrawTool,
  sendTransferTool,
  borrowTool,
  repayDebtTool,
  claimRewardsTool,
  harvestRewardsTool,
  swapExecuteTool,
  voloStakeTool,
  voloUnstakeTool,
];

export function getDefaultTools(): Tool[] {
  return applyToolFlags([...READ_TOOLS, ...WRITE_TOOLS]);
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
  voloStakeTool,
  voloUnstakeTool,
  voloStatsTool,
  webSearchTool,
  explainTxTool,
  portfolioAnalysisTool,
  protocolDeepDiveTool,
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
  updateTodoTool,
  addRecipientTool,
};
