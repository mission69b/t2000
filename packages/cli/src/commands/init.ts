// `t2 init` — create a fresh v2 plain Bech32 wallet. No PIN prompt.
// Footer banner: "No spending limits set. Run `t2 limit set --daily <usd>`
// to add them." — visible reminder, no prompt friction.

import {
  T2000,
  generateKeypair,
  saveKey,
  walletExists,
  getAddress,
} from '@t2000/sdk';
import { Command } from 'commander';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printLine,
  printJson,
  isJsonMode,
  handleError,
} from '../output.js';

export interface InitOptions {
  key?: string;
}

const NO_LIMITS_FOOTER =
  'No spending limits set. Run `t2 limit set --daily <usd>` to add them.';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Create a new Agent Wallet (no PIN; plain Bech32 key file with 0o600 perms)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: InitOptions) => {
      try {
        if (await walletExists(opts.key)) {
          throw new Error(
            `Wallet already exists at ${opts.key ?? '~/.t2000/wallet.key'}. Move or delete it first.`,
          );
        }

        const keypair = generateKeypair();
        await saveKey(keypair, undefined, opts.key);
        const address = getAddress(keypair);

        if (isJsonMode()) {
          printJson({ address, configPath: opts.key ?? '~/.t2000/wallet.key' });
          return;
        }

        printBlank();
        printSuccess('Wallet created');
        printKeyValue('Address', address);
        printKeyValue('Path', opts.key ?? '~/.t2000/wallet.key');
        printBlank();
        printLine(`⚠  ${NO_LIMITS_FOOTER}`);
        printBlank();

        // Eager construct + warm a SuiClient so the next command doesn't pay
        // first-call latency. Non-fatal if it fails (e.g. offline init).
        try {
          await T2000.create({ keyPath: opts.key });
        } catch {
          /* tolerated */
        }
      } catch (error) {
        handleError(error);
      }
    });
}

export { NO_LIMITS_FOOTER };
