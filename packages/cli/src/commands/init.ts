import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { askPassphraseConfirm, getPassphraseFromEnv } from '../prompts.js';
import {
  printSuccess, printSuccessKV, printBlank, printInfo,
  printJson, printDivider, printLine, isJsonMode, handleError,
  copyToClipboard,
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
          printBlank();
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

        const keyPath = opts.key ?? '~/.t2000/agent-0.key';
        const network = 'Sui mainnet';

        printSuccessKV('Keypair generated', '');
        printSuccessKV('Keypair saved', keyPath, 20);
        printSuccessKV('Config written', '~/.t2000/config.json', 20);
        printSuccessKV('Network', network, 20);
        printSuccessKV('Gas sponsorship', sponsored ? 'enabled' : 'disabled', 20);

        printBlank();
        printInfo('Setting up accounts...');
        printBlank();

        printSuccessKV('Checking', 'hold and send USDC instantly', 20);
        printSuccessKV('Savings', 'earn yield automatically', 20);
        printSuccessKV('Credit', 'borrow against your savings', 20);
        printSuccessKV('Exchange', 'swap currencies on demand', 20);
        printSuccessKV('402 Pay', 'pay for APIs and services autonomously', 20);

        printBlank();
        printLine(`🎉 ${pc.green('Bank account created successfully')}`);

        const copied = copyToClipboard(address);
        printBlank();
        printDivider();
        printLine(`Your agent's address${copied ? ' (copied to clipboard)' : ''}:`);
        printLine(pc.yellow(address));
        printBlank();
        printLine(`Deposit USDC on Sui network — not Ethereum, Base, or Solana`);
        printDivider();

        printBlank();
        printLine(`${pc.cyan('t2000 balance --watch')}    wait for funds to arrive`);
        printLine(`${pc.cyan('t2000 save all')}           start earning yield`);
        printLine(`${pc.cyan('t2000 address')}            show address again`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
