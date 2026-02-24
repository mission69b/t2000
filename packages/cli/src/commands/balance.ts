import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('Show wallet balance')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

        const bal = await agent.balance();

        if (isJsonMode()) {
          printJson(bal);
          return;
        }

        printBlank();
        printKeyValue('Available', `${formatUsd(bal.available)} USDC`);
        if (bal.savings > 0) {
          printKeyValue('Savings', `${formatUsd(bal.savings)} USDC`);
        }
        printKeyValue('Gas reserve', `${bal.gasReserve.sui.toFixed(4)} SUI (~${formatUsd(bal.gasReserve.usdEquiv)})`);
        printKeyValue('Total', formatUsd(bal.total));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
