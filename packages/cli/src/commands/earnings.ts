import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerEarnings(program: Command) {
  program
    .command('earnings')
    .description('Show yield earned to date')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

        const result = await agent.earnings();

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printKeyValue('Saved', `$${result.supplied.toFixed(2)} USDC`);
        printKeyValue('APY', `${result.currentApy.toFixed(2)}%`);
        printKeyValue('Daily Yield', `~$${result.dailyEarning.toFixed(4)}/day`);
        printKeyValue('Est. Earned', `~$${result.totalYieldEarned.toFixed(4)}`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
