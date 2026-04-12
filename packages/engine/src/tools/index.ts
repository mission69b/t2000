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
import { allowanceStatusTool, toggleAllowanceTool, updateDailyLimitTool, updatePermissionsTool } from './allowance.js';
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
import { createScheduleTool, listSchedulesTool, cancelScheduleTool } from './schedule.js';
import {
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
} from './defillama.js';

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
  allowanceStatusTool,
  toggleAllowanceTool,
  updateDailyLimitTool,
  updatePermissionsTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  listInvoicesTool,
  cancelInvoiceTool,
  createPaymentLinkTool,
  createInvoiceTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
  listSchedulesTool,
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
  createScheduleTool,
  cancelScheduleTool,
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
  allowanceStatusTool,
  toggleAllowanceTool,
  updateDailyLimitTool,
  updatePermissionsTool,
  createPaymentLinkTool,
  listPaymentLinksTool,
  cancelPaymentLinkTool,
  createInvoiceTool,
  cancelInvoiceTool,
  listInvoicesTool,
  spendingAnalyticsTool,
  yieldSummaryTool,
  activitySummaryTool,
  createScheduleTool,
  listSchedulesTool,
  cancelScheduleTool,
};
