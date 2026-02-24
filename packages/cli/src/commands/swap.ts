import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv, askConfirm } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning } from '../output.js';

export function registerSwap(program: Command) {
  program
    .command('swap')
    .description('Swap between assets (e.g. swap 10 USDC SUI)')
    .argument('<amount>', 'Amount to swap')
    .argument('<from>', 'Asset to swap from (USDC or SUI)')
    .argument('<to>', 'Asset to swap to (USDC or SUI)')
    .option('--slippage <percent>', 'Max slippage percentage', '3')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr: string, from: string, to: string, opts: { slippage?: string; key?: string }) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        const maxSlippage = parseFloat(opts.slippage ?? '3') / 100;

        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

        // Show quote before confirming
        const quote = await agent.swapQuote({ from, to, amount });

        const globalOpts = program.optsWithGlobals();
        if (!globalOpts.yes) {
          printBlank();
          printKeyValue('Swap', `${amount} ${from.toUpperCase()} → ${quote.expectedOutput.toFixed(4)} ${to.toUpperCase()}`);
          printKeyValue('Pool Price', `1 SUI = $${quote.poolPrice.toFixed(2)}`);
          if (quote.fee.amount > 0) {
            printKeyValue('Protocol Fee', `$${quote.fee.amount.toFixed(4)} (${quote.fee.rate}%)`);
          }
          printBlank();

          const ok = await askConfirm('Execute swap?');
          if (!ok) return;
        }

        const result = await agent.swap({ from, to, amount, maxSlippage });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Swapped ${result.fromAmount} ${result.fromAsset} → ${result.toAmount.toFixed(4)} ${result.toAsset}`);
        if (result.priceImpact > 0.001) {
          printWarning(`Price impact: ${(result.priceImpact * 100).toFixed(2)}%`);
        }
        if (result.fee > 0) {
          printKeyValue('Fee', `$${result.fee.toFixed(4)}`);
        }
        printKeyValue('Tx', result.tx);
        printKeyValue('Gas', `${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
