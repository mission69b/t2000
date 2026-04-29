import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerSwap(program: Command) {
  program
    .command('swap')
    .description('Swap tokens via Cetus Aggregator (20+ DEXs)')
    .argument('<amount>', 'Amount to swap')
    .argument('<from>', 'Source token (e.g. SUI, USDC, CETUS)')
    .argument('[to_keyword]', '"for" keyword (optional)')
    .argument('<to>', 'Target token (e.g. USDC, SUI, DEEP)')
    .option('--slippage <pct>', 'Max slippage percentage (default: 1)', '1')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr: string, from: string, toKeywordOrTo: string, to: string | undefined, opts: { key?: string; slippage?: string }) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        if (toKeywordOrTo?.toLowerCase() === 'for' && !to) {
          throw new Error('Usage: t2000 swap <amount> <from> [for] <to>');
        }
        const actualTo = to ?? toKeywordOrTo;

        const slippage = Math.min(parseFloat(opts.slippage ?? '1') / 100, 0.05);

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.swap({ from, to: actualTo, amount, slippage });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Swapped ${pc.yellow(String(result.fromAmount))} ${result.fromToken} for ${pc.green(result.toAmount.toFixed(4))} ${result.toToken}`);
        if (result.priceImpact > 0.005) {
          printKeyValue('Price Impact', pc.yellow(`${(result.priceImpact * 100).toFixed(2)}%`));
        }
        printKeyValue('Route', `${result.fromToken} → ${result.toToken} (${result.route})`);
        printKeyValue('Gas', `${result.gasCost.toFixed(4)} SUI`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
