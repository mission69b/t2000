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

export const READ_TOOLS: Tool[] = [
  balanceCheckTool,
  savingsInfoTool,
  healthCheckTool,
  ratesInfoTool,
  transactionHistoryTool,
];

export const WRITE_TOOLS: Tool[] = [
  saveDepositTool,
  withdrawTool,
  sendTransferTool,
  borrowTool,
  repayDebtTool,
  claimRewardsTool,
  payApiTool,
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
};
