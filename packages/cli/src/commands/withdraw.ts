import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin, askConfirm } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning, explorerUrl } from '../output.js';

export function registerWithdraw(program: Command) {
  program
    .command('withdraw')
    .description('Withdraw USDC from savings')
    .argument('<amount>', 'Amount in USDC to withdraw (or "all")')
    .argument('[asset]', 'Asset symbol (default: USDC)', 'USDC')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr, assetStr, opts) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        if (amount !== 'all') {
          const maxResult = await agent.maxWithdraw();
          if (amount > maxResult.maxAmount) {
            printWarning(`Max safe withdrawal: $${maxResult.maxAmount.toFixed(2)} (HF ${maxResult.currentHF.toFixed(2)} → ${maxResult.healthFactorAfter.toFixed(2)})`);
            return;
          }
        }

        const globalOpts = program.optsWithGlobals();
        if (!globalOpts.yes) {
          const label = amount === 'all' ? 'all savings' : `$${amount.toFixed(2)} USDC`;
          const ok = await askConfirm(`Withdraw ${label} from savings?`);
          if (!ok) return;
        }

        const asset = assetStr ?? 'USDC';
        const result = await agent.withdraw({ amount, asset });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Withdrew $${result.amount.toFixed(2)} USDC`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
