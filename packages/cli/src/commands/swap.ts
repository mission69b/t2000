import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning, explorerUrl } from '../output.js';

export function registerSwap(program: Command) {
  program
    .command('swap')
    .description('Swap between assets (e.g. swap 10 USDC SUI)')
    .argument('<amount>', 'Amount to swap')
    .argument('<from>', 'Asset to swap from (USDC or SUI)')
    .argument('<to>', 'Asset to swap to (USDC or SUI)')
    .option('--slippage <percent>', 'Max slippage percentage', '3')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. cetus)')
    .action(async (amountStr: string, from: string, to: string, opts: { slippage?: string; key?: string; protocol?: string }) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        const maxSlippage = parseFloat(opts.slippage ?? '3') / 100;

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        // Show quote before confirming
        const quote = await agent.swapQuote({ from, to, amount });

        const result = await agent.swap({ from, to, amount, maxSlippage, protocol: opts.protocol });

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
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
