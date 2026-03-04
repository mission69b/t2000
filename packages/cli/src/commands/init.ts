import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin, saveSession } from '../prompts.js';
import {
  printSuccess, printBlank, printInfo, printKeyValue,
  printJson, printLine, printDivider, isJsonMode, handleError,
} from '../output.js';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Create a new agent bank account')
    .option('--name <name>', 'Agent name')
    .option('--key <path>', 'Key file path')
    .option('--no-sponsor', 'Skip gas sponsorship')
    .action(async (opts) => {
      try {
        const pin = await resolvePin({ confirm: true });

        if (!isJsonMode()) {
          printBlank();
          printInfo('Creating agent wallet...');
        }

        const { agent, address, sponsored } = await T2000.init({
          pin,
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
        printKeyValue('Address', pc.yellow(address));

        printBlank();
        printLine(`Deposit USDC on Sui network only.`);
        printDivider();
        printBlank();
        printLine(`${pc.cyan('t2000 balance')}            check for funds`);
        printLine(`${pc.cyan('t2000 save all')}           start earning yield`);
        printLine(`${pc.cyan('t2000 address')}            show address again`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
