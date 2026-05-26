// `t2 export` — print the Bech32 secret (`suiprivkey1...`) for backup.
// No PIN gate (v4 wallets aren't encrypted). Confirmation prompt only
// when stdout is a TTY — scripts (`--yes` or piped) skip the warning.

import { Command } from 'commander';
import { withAgent } from '../lib/with-agent.js';
import { askConfirm } from '../lib/prompts.js';
import {
  printSuccess,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../output.js';

export interface ExportOptions {
  key?: string;
  yes?: boolean;
}

export function registerExport(program: Command) {
  program
    .command('export')
    .description('Print the Bech32 wallet secret (for backup / recovery)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--yes', 'Skip the confirmation prompt')
    .action(async (opts: ExportOptions) => {
      try {
        if (!opts.yes && !isJsonMode()) {
          const proceed = await askConfirm(
            'WARNING: This will print your wallet secret. Anyone with it controls the wallet. Continue?',
            false,
          );
          if (!proceed) return;
        }

        const agent = await withAgent({ keyPath: opts.key });
        const secret = agent.exportKey();

        if (isJsonMode()) {
          printJson({ secret, format: 'bech32' });
          return;
        }

        printBlank();
        printSuccess('Wallet secret (Bech32 suiprivkey):');
        process.stdout.write(`  ${secret}\n`);
        printBlank();
        printInfo('Store securely. Anyone with this secret controls the wallet. Re-import on another box via `t2 init --import` (interactive prompt).');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
