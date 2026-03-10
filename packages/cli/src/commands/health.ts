import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printSuccess, printWarning, printError } from '../output.js';

export function registerHealth(program: Command) {
  program
    .command('health')
    .description('Check savings health factor')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const hf = await agent.healthFactor();

        if (isJsonMode()) {
          printJson(hf);
          return;
        }

        printBlank();

        const noActiveLoan = hf.borrowed < 0.01;
        const hfStr = (hf.healthFactor === Infinity || noActiveLoan) ? '∞' : hf.healthFactor.toFixed(2);
        if (hf.healthFactor >= 2.0) {
          printSuccess(`Health Factor: ${hfStr} (healthy)`);
        } else if (hf.healthFactor >= 1.5) {
          printWarning(`Health Factor: ${hfStr} (moderate)`);
        } else if (hf.healthFactor >= 1.2) {
          printWarning(`Health Factor: ${hfStr} (low)`);
        } else {
          printError(`Health Factor: ${hfStr} (CRITICAL)`);
        }

        printBlank();
        printKeyValue('Supplied', `${formatUsd(hf.supplied)} USDC`);
        printKeyValue('Borrowed', `${formatUsd(hf.borrowed)} USDC`);
        printKeyValue('Max Borrow', `${formatUsd(hf.maxBorrow)} USDC`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
