import type { Command } from 'commander';
import { T2000, keypairFromPrivateKey, saveKey } from '@t2000/sdk';
import { askPassphraseConfirm, getPassphraseFromEnv } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';
import { password } from '@inquirer/prompts';

export function registerImport(program: Command) {
  program
    .command('import')
    .description('Import a wallet from private key')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        let privateKey: string;
        if (process.env.T2000_PRIVATE_KEY) {
          privateKey = process.env.T2000_PRIVATE_KEY;
        } else {
          privateKey = await password({ message: 'Enter private key (hex):' });
        }

        if (!privateKey) throw new Error('Private key is required');

        const passphrase = getPassphraseFromEnv() ?? await askPassphraseConfirm();

        const keypair = keypairFromPrivateKey(privateKey);
        const address = keypair.getPublicKey().toSuiAddress();
        await saveKey(keypair, passphrase, opts.key);

        if (isJsonMode()) {
          printJson({ address, imported: true });
          return;
        }

        printBlank();
        printSuccess('Wallet imported (encrypted)');
        printKeyValue('Address', address);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
