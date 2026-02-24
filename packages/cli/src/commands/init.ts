import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { askPassphraseConfirm, getPassphraseFromEnv } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printInfo, printJson, isJsonMode, handleError } from '../output.js';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Create a new agent wallet')
    .option('--name <name>', 'Agent name')
    .option('--key <path>', 'Key file path')
    .option('--no-sponsor', 'Skip gas sponsorship')
    .action(async (opts) => {
      try {
        const passphrase = getPassphraseFromEnv() ?? await askPassphraseConfirm();

        const { agent, address, sponsored } = await T2000.init({
          passphrase,
          keyPath: opts.key,
          name: opts.name,
          sponsored: opts.sponsor,
        });

        if (isJsonMode()) {
          printJson({ address, sponsored });
          return;
        }

        printBlank();
        printSuccess('Wallet created (encrypted)');
        printBlank();
        printKeyValue('Address', address);

        if (sponsored) {
          printKeyValue('Gas', 'Sponsored (0.05 SUI)');
          printSuccess('Ready to go — wallet funded.');
        } else {
          printKeyValue('Balance', '$0.00 USDC');
          printBlank();
          printInfo('Fund your wallet:');
          printInfo('→ t2000 deposit   (shows funding options)');
        }

        printBlank();
        printSuccess('Ready. Your agent has a wallet.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
