import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerSwapQuote(program: Command) {
  program
    .command('swap-quote')
    .description('Preview a swap quote without executing (shows output, price impact, route)')
    .argument('<amount>', 'Amount to swap')
    .argument('<from>', 'Source token (e.g. SUI, USDC)')
    .argument('[to_keyword]', '"for" keyword (optional)')
    .argument('<to>', 'Target token (e.g. USDC, SUI)')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr: string, from: string, toKeywordOrTo: string, to: string | undefined, opts: { key?: string }) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        if (toKeywordOrTo?.toLowerCase() === 'for' && !to) {
          throw new Error('Usage: t2000 swap-quote <amount> <from> [for] <to>');
        }
        const actualTo = to ?? toKeywordOrTo;

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.swapQuote({ from, to: actualTo, amount });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printKeyValue('Input', `${result.fromAmount} ${result.fromToken}`);
        printKeyValue('Output', pc.green(`${result.toAmount.toFixed(6)} ${result.toToken}`));
        if (result.priceImpact > 0.001) {
          printKeyValue('Price Impact', pc.yellow(`${(result.priceImpact * 100).toFixed(2)}%`));
        }
        printKeyValue('Route', `${result.fromToken} → ${result.toToken} (${result.route})`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
