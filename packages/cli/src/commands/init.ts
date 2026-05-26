// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// `t2 init` — create a fresh v2 plain Bech32 wallet. No PIN prompt.
// `t2 init --import` — interactive hidden-input prompt for v3.x recovery.
// `t2 init --import <secret>` — direct CLI flag (scripting; prints
// shell-history warning).
//
// Footer banner: "No spending limits set. Run `t2 limit set --daily <usd>`
// to add them." — visible reminder; no prompt friction.

import process from 'node:process';
import { Command } from 'commander';
import {
  T2000,
  generateKeypair,
  saveKey,
  saveBech32,
  walletExists,
  getAddress,
} from '@t2000/sdk';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printWarning,
  printLine,
  printJson,
  isJsonMode,
  handleError,
} from '../output.js';
import { askHidden } from '../lib/prompts.js';
import {
  checkForLegacyWallet,
  formatLegacyWalletBanner,
} from '../lib/legacy-wallet-detect.js';

export interface InitOptions {
  key?: string;
  import?: string | boolean;
}

const NO_LIMITS_FOOTER =
  'No spending limits set. Run `t2 limit set --daily <usd>` to add them.';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Create a new Agent Wallet (no PIN; plain Bech32 key file with 0o600 perms)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option(
      '--import [secret]',
      'Import an existing wallet via Bech32 secret. Omit the value for an interactive hidden-input prompt.',
    )
    .action(async (opts: InitOptions) => {
      try {
        if (await checkForLegacyWallet(opts.key)) {
          process.stderr.write(formatLegacyWalletBanner(opts.key ?? '~/.t2000/wallet.key'));
          process.exit(1);
        }

        if (await walletExists(opts.key)) {
          throw new Error(
            `Wallet already exists at ${opts.key ?? '~/.t2000/wallet.key'}. Move or delete it first.`,
          );
        }

        let address: string;
        let imported = false;

        if (opts.import !== undefined) {
          const secret = typeof opts.import === 'string' && opts.import.length > 0
            ? opts.import
            : await askHidden('Paste your suiprivkey1... secret:');

          if (typeof opts.import === 'string' && opts.import.length > 0) {
            printWarning('Private key passed as a CLI flag will be in shell history. Prefer the interactive prompt: `t2 init --import` (no value).');
          }

          await saveBech32(secret, opts.key);
          const { keypairFromPrivateKey } = await import('@t2000/sdk');
          address = getAddress(keypairFromPrivateKey(secret));
          imported = true;
        } else {
          const keypair = generateKeypair();
          await saveKey(keypair, undefined, opts.key);
          address = getAddress(keypair);
        }

        if (isJsonMode()) {
          printJson({ address, imported, configPath: opts.key ?? '~/.t2000/wallet.key' });
          return;
        }

        printBlank();
        printSuccess(imported ? 'Wallet imported' : 'Wallet created');
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
