import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin, askConfirm } from '../prompts.js';
import { printSuccess, printBlank, printInfo, printJson, isJsonMode, handleError } from '../output.js';

export function registerExport(program: Command) {
  program
    .command('export')
    .description('Export private key (raw Ed25519 hex)')
    .option('--key <path>', 'Key file path')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        if (!opts.yes && !isJsonMode()) {
          const proceed = await askConfirm(
            'WARNING: This will display your raw private key. Anyone with this key controls your wallet. Continue?',
          );
          if (!proceed) return;
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const hex = agent.exportKey();

        if (isJsonMode()) {
          printJson({ privateKey: hex, format: 'ed25519_hex' });
          return;
        }

        printBlank();
        printSuccess('Private key (Ed25519, hex):');
        console.log(`  ${hex}`);
        printBlank();
        printInfo('Not a BIP39 mnemonic. Store securely and never share.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
