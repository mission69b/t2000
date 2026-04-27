import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

type RepayAsset = 'USDC' | 'USDsui';
const REPAY_ASSETS: readonly RepayAsset[] = ['USDC', 'USDsui'] as const;

function resolveRepayAsset(input: string | undefined): RepayAsset | undefined {
  if (!input) return undefined;
  const match = REPAY_ASSETS.find((a) => a.toLowerCase() === input.toLowerCase());
  if (!match) {
    throw new Error(`--asset must be one of: ${REPAY_ASSETS.join(', ')}. Got: "${input}"`);
  }
  return match;
}

export function registerRepay(program: Command) {
  program
    .command('repay')
    .description('Repay borrowed USDC or USDsui')
    .argument('<amount>', 'Amount to repay (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <symbol>', 'Asset to repay: USDC or USDsui (omit to repay highest-APY borrow)')
    .action(async (amountStr, opts) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const asset = resolveRepayAsset(opts.asset);

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.repay({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        const repaidAsset = (result as { asset?: string }).asset ?? asset ?? 'USDC';
        printBlank();
        printSuccess(`Repaid ${formatUsd(result.amount)} ${repaidAsset}`);
        printKeyValue('Remaining Debt', formatUsd(result.remainingDebt));
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
