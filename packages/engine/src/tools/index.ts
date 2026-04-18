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
import { payApiTool } from './pay.js';
import { mppServicesTool } from './mpp-services.js';
import { swapExecuteTool } from './swap.js';
import { swapQuoteTool } from './swap-quote.js';
import { voloStakeTool } from './volo-stake.js';
import { voloUnstakeTool } from './volo-unstake.js';
import { voloStatsTool } from './volo-stats.js';
import { saveContactTool } from './contacts.js';
import { webSearchTool } from './web-search.js';
import { explainTxTool } from './explain-tx.js';
import { portfolioAnalysisTool } from './portfolio-analysis.js';
import { protocolDeepDiveTool } from './protocol-deep-dive.js';
import {
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  createInvoiceTool,
  cancelInvoiceTool,
  listInvoicesTool,
} from './receive.js';
import { renderCanvasTool } from './canvas.js';
import { spendingAnalyticsTool } from './spending.js';
import { yieldSummaryTool } from './yield-summary.js';
import { activitySummaryTool } from './activity-summary.js';
import {
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
} from './defillama.js';

// [SIMPLIFICATION DAY 7] Removed 9 tools to align engine with chat-first thesis:
//   - allowance_status, toggle_allowance, update_daily_limit, update_permissions
//     (allowance contract dormant; agent autonomy under zkLogin was theatre)
//   - create_schedule, list_schedules, cancel_schedule
//     (DCA/scheduled actions can't execute without user online to sign)
//   - pause_pattern, pattern_status
//     (pattern detection as proposals removed; classifiers stay as pure fns)
// Final tool count: 29 reads + 11 writes = 40 tools.

export const READ_TOOLS: Tool[] = [
  renderCanvasTool,
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
  swapQuoteTool,
  voloStatsTool,
  mppServicesTool,
  webSearchTool,
  explainTxTool,
  portfolioAnalysisTool,
  protocolDeepDiveTool,
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  listInvoicesTool,
  cancelInvoiceTool,
  createPaymentLinkTool,
  createInvoiceTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
];

export const WRITE_TOOLS: Tool[] = [
  saveDepositTool,
  withdrawTool,
  sendTransferTool,
  borrowTool,
  repayDebtTool,
  claimRewardsTool,
  payApiTool,
  swapExecuteTool,
  voloStakeTool,
  voloUnstakeTool,
  saveContactTool,
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
  payApiTool,
  mppServicesTool,
  swapExecuteTool,
  swapQuoteTool,
  voloStakeTool,
  voloUnstakeTool,
  voloStatsTool,
  webSearchTool,
  explainTxTool,
  portfolioAnalysisTool,
  protocolDeepDiveTool,
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
  saveContactTool,
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  createInvoiceTool,
  cancelInvoiceTool,
  listInvoicesTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
};
