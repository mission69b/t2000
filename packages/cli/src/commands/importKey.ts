import type { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { T2000, keypairFromPrivateKey, saveKey, SafeguardEnforcer } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printError } from '../output.js';
import { password } from '@inquirer/prompts';

export function registerImport(program: Command) {
  program
    .command('import')
    .description('Import a wallet from private key')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const enforcer = new SafeguardEnforcer(join(homedir(), '.t2000'));
        enforcer.load();
        if (enforcer.getConfig().locked) {
          printError('Agent is locked. Unlock first: t2000 unlock');
          return;
        }

        let privateKey: string;
        if (process.env.T2000_PRIVATE_KEY) {
          privateKey = process.env.T2000_PRIVATE_KEY;
        } else {
          privateKey = await password({ message: 'Enter private key (hex):' });
        }

        if (!privateKey) throw new Error('Private key is required');

        const pin = await resolvePin({ confirm: true });

        const keypair = keypairFromPrivateKey(privateKey);
        const address = keypair.getPublicKey().toSuiAddress();
        await saveKey(keypair, pin, opts.key);

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
