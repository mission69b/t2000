import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printHeader, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerDeposit(program: Command) {
  program
    .command('deposit')
    .description('Show funding instructions')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const info = await agent.deposit();

        if (isJsonMode()) {
          printJson(info);
          return;
        }

        printHeader('Fund your wallet');
        console.log(info.instructions);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
