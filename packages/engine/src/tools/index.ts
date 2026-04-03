import type { Tool } from '../types.js';
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
import { swapExecuteTool } from './swap.js';
import { swapQuoteTool } from './swap-quote.js';
import { voloStakeTool } from './volo-stake.js';
import { voloUnstakeTool } from './volo-unstake.js';
import { voloStatsTool } from './volo-stats.js';
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
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
  swapQuoteTool,
  voloStatsTool,
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
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
];

export function getDefaultTools(): Tool[] {
  return [...READ_TOOLS, ...WRITE_TOOLS];
}

export {
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
  swapExecuteTool,
  swapQuoteTool,
  voloStakeTool,
  voloUnstakeTool,
  voloStatsTool,
  defillamaYieldPoolsTool,
  defillamaProtocolInfoTool,
  defillamaTokenPricesTool,
  defillamaPriceChangeTool,
  defillamaChainTvlTool,
  defillamaProtocolFeesTool,
  defillamaSuiProtocolsTool,
};
