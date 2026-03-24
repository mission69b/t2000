import type { Command } from 'commander';
import { T2000, SUPPORTED_ASSETS } from '@t2000/sdk';
import pc from 'picocolors';
import { resolvePin } from '../prompts.js';
import { printJson, isJsonMode, handleError } from '../output.js';

function resolveAssetName(input: string): string {
  const upper = input.toUpperCase();
  for (const key of Object.keys(SUPPORTED_ASSETS)) {
    if (key.toUpperCase() === upper) return key;
  }
  return input;
}

/** @deprecated Use `swap` command instead */
export function registerExchange(program: Command) {
  program
    .command('exchange <amount> <from> <to>')
    .description('[deprecated — use "swap" instead] Exchange between tokens')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percentage (default: 3)', '3')
    .action(async (amount: string, from: string, to: string, opts: { key?: string; slippage?: string }) => {
      try {
        console.error(pc.yellow('  ⚠ "exchange" is deprecated. Use "swap" instead: t2000 swap %s %s %s'), amount, from, to);
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Amount must be a positive number');

        const result = await agent.swap({
          from: resolveAssetName(from),
          to: resolveAssetName(to),
          amount: parsedAmount,
          maxSlippage: parseFloat(opts.slippage ?? '3') / 100,
        });

        if (isJsonMode()) { printJson(result); return; }
        console.log(pc.green('  ✓ Swapped. Tx: %s'), result.tx);
      } catch (error) {
        handleError(error);
      }
    });
}
