import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printInfo } from '../output.js';

export function registerRates(program: Command) {
  program
    .command('rates')
    .description('Show current NAVI Protocol APY rates')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const rates = await agent.rates();

        if (isJsonMode()) {
          printJson(rates);
          return;
        }

        printBlank();
        printInfo('USDC Rates (NAVI Protocol)');
        printKeyValue('Save APY', `${rates.USDC.saveApy.toFixed(2)}%`);
        printKeyValue('Borrow APY', `${rates.USDC.borrowApy.toFixed(2)}%`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
