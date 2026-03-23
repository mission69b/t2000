/**
 * Maps Move abort codes and wallet errors to user-friendly messages
 * with actionable suggestions.
 */

import type { FeedItemData } from './feed-types';

const MOVE_ABORT_MAP: Record<number, { message: string; chips?: { label: string; flow: string }[] }> = {
  0: { message: 'Protocol is temporarily paused. Try again later.' },
  1: { message: 'Insufficient balance to complete this action.', chips: [{ label: 'Check balance', flow: 'balance' }] },
  2: { message: 'This amount is below the minimum deposit (1 SUI).', chips: [{ label: 'Deposit more', flow: 'save' }] },
  3: { message: 'You can\'t withdraw more than your available savings.', chips: [{ label: 'Withdraw what\'s available', flow: 'withdraw' }] },
  4: { message: 'Repayment exceeds your outstanding loan.', chips: [{ label: 'Check balance', flow: 'balance' }] },
  5: { message: 'Your position is at risk. Repay some of your loan first.', chips: [{ label: 'Repay $50', flow: 'repay' }] },
};

const WALLET_ERROR_MAP: [RegExp, string][] = [
  [/user rejected|user denied|cancelled/i, 'Transaction cancelled. No funds were moved.'],
  [/insufficient.*balance|insufficient.*gas/i, 'Insufficient balance. Add funds and try again.'],
  [/gas budget.*exceeded/i, 'Transaction too expensive. Try a smaller amount.'],
  [/object.*not found/i, 'Account data is stale. Refreshing...'],
  [/network.*error|fetch.*failed|timed?\s?out/i, 'Network issue. Check your connection and try again.'],
  [/rate.?limit|too many transactions/i, 'Too many transactions. Please wait a moment and try again.'],
  [/sponsorship failed|gas pool/i, 'Gas sponsorship temporarily unavailable. Please try again later.'],
  [/sponsored transaction expired/i, 'Transaction expired. Please try again.'],
  [/disallowed.*move.*call/i, 'This transaction type is not yet enabled. Contact support.'],
];

export function mapError(error: unknown): FeedItemData {
  const message = error instanceof Error ? error.message : String(error);

  // Move abort codes
  const abortMatch = message.match(/MoveAbort.*?(\d+)/);
  if (abortMatch) {
    const code = parseInt(abortMatch[1], 10);
    const mapped = MOVE_ABORT_MAP[code];
    if (mapped) {
      return { type: 'error', message: mapped.message, chips: mapped.chips };
    }
  }

  // Wallet / RPC errors
  for (const [pattern, friendlyMessage] of WALLET_ERROR_MAP) {
    if (pattern.test(message)) {
      return { type: 'error', message: friendlyMessage };
    }
  }

  // Generic fallback
  return {
    type: 'error',
    message: `Something went wrong: ${message.slice(0, 120)}`,
    chips: [{ label: 'Try again', flow: 'help' }],
  };
}
