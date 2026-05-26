import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export type WithdrawAsset = 'USDC' | 'USDsui';
export const WITHDRAW_ASSETS: readonly WithdrawAsset[] = ['USDC', 'USDsui'] as const;

// [SPEC_AGENTIC_STACK P1 / CLI F6 followup — 2026-05-25]
// Validate `--asset` at the CLI layer (case-insensitive). Returns `undefined`
// when omitted — that means "let the SDK auto-detect the position to withdraw
// from". Pre-fix, the CLI passed `opts.asset` raw to the SDK, which compares
// asset strings case-sensitively at `withdraw()` line 834 — so `--asset usdc`
// silently filtered to zero positions and the user got the misleading
// `No savings to withdraw` error.
export function resolveWithdrawAsset(input: string | undefined): WithdrawAsset | undefined {
  if (!input) return undefined;
  const match = WITHDRAW_ASSETS.find((a) => a.toLowerCase() === input.toLowerCase());
  if (!match) {
    throw new Error(`--asset must be one of: ${WITHDRAW_ASSETS.join(', ')}. Got: "${input}"`);
  }
  return match;
}

export function registerWithdraw(program: Command) {
  program
    .command('withdraw')
    .description('Withdraw USDC or USDsui from NAVI lending')
    .argument('<amount>', 'Amount to withdraw (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <symbol>', 'Asset to withdraw: USDC or USDsui (omit to auto-detect)')
    .action(async (amountStr, opts) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const asset = resolveWithdrawAsset(opts.asset);

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.withdraw({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        const withdrawnAsset = result.asset ?? asset ?? 'USDC';
        printBlank();
        printSuccess(`Withdrew ${formatUsd(result.amount)} ${withdrawnAsset}`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
