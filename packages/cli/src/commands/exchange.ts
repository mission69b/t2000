import type { Command } from 'commander';
import { T2000, formatUsd, SUPPORTED_ASSETS } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerExchange(program: Command) {
  program
    .command('exchange <amount> <from> <to>')
    .description('Exchange between tokens (e.g. USDC ⇌ SUI) via Cetus DEX')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percentage (default: 3)', '3')
    .action(async (amount: string, from: string, to: string, opts: { key?: string; slippage?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const fromAsset = from.toUpperCase();
        const toAsset = to.toUpperCase();
        const parsedAmount = parseFloat(amount);

        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        const result = await agent.exchange({
          from: fromAsset,
          to: toAsset,
          amount: parsedAmount,
          maxSlippage: parseFloat(opts.slippage ?? '3'),
        });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        const fromDisplay = SUPPORTED_ASSETS[fromAsset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? fromAsset;
        const toDisplay = SUPPORTED_ASSETS[toAsset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? toAsset;
        const toDecimals = toAsset === 'SUI' ? 4 : 2;

        printBlank();
        printSuccess(`Exchanged ${parsedAmount} ${fromDisplay} → ${result.toAmount.toFixed(toDecimals)} ${toDisplay}`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printKeyValue('Gas', `${result.gasCost.toFixed(4)} SUI (${result.gasMethod})`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
