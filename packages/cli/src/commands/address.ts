import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerAddress(program: Command) {
  program
    .command('address')
    .description('Show wallet address')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        if (isJsonMode()) {
          printJson({ address: agent.address() });
          return;
        }

        printBlank();
        printKeyValue('Address', agent.address());
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
