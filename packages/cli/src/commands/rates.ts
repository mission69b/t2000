import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printInfo } from '../output.js';

export function registerRates(program: Command) {
  program
    .command('rates')
    .description('Show current APY rates across protocols')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const allRates = await agent.allRates('USDC');

        if (isJsonMode()) {
          printJson(allRates);
          return;
        }

        printBlank();
        for (const entry of allRates) {
          printInfo(`USDC Rates ${pc.dim(`(${entry.protocol})`)}`);
          printKeyValue('Save APY', `${entry.rates.saveApy.toFixed(2)}%`);
          printKeyValue('Borrow APY', `${entry.rates.borrowApy.toFixed(2)}%`);
          printBlank();
        }
        if (allRates.length === 0) {
          printInfo('No protocol rates available');
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });
}
