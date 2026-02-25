import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { truncateAddress } from '@t2000/sdk';
import { askPassphraseConfirm, getPassphraseFromEnv } from '../prompts.js';
import {
  printSuccess, printBlank, printInfo, printKeyValue,
  printJson, printLine, isJsonMode, handleError,
} from '../output.js';

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

        if (!isJsonMode()) {
          printBlank();
          printInfo('Creating agent wallet...');
        }

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

        printSuccess('Keypair generated');
        printSuccess(`Network ${pc.dim('Sui mainnet')}`);
        printSuccess(`Gas sponsorship ${pc.dim(sponsored ? 'enabled' : 'disabled')}`);

        printBlank();
        printInfo('Setting up accounts...');

        printLine(
          `${pc.green('✓')} Checking  ` +
          `${pc.green('✓')} Savings  ` +
          `${pc.green('✓')} Credit  ` +
          `${pc.green('✓')} Exchange  ` +
          `${pc.green('✓')} 402 Pay`
        );

        printBlank();
        printLine(`🎉 ${pc.green('Bank account created')}`);
        printKeyValue('Address', pc.yellow(truncateAddress(address)));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
