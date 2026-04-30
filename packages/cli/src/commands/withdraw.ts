import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerWithdraw(program: Command) {
  program
    .command('withdraw')
    .description('Withdraw USDC or USDsui from NAVI lending')
    .argument('<amount>', 'Amount to withdraw (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <token>', 'Asset to withdraw (default: auto-detect)')
    .action(async (amountStr, opts) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.withdraw({ amount, asset: opts.asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        const assetLabel = opts.asset ?? 'USDC';
        printBlank();
        printSuccess(`Withdrew ${formatUsd(result.amount)} ${assetLabel}`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
