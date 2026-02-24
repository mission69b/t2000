import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printInfo } from '../output.js';

export function registerPositions(program: Command) {
  program
    .command('positions')
    .description('Show savings & borrow positions')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

        const result = await agent.positions();

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        if (result.positions.length === 0) {
          printInfo('No positions. Use `t2000 save <amount>` to start earning.');
        } else {
          for (const pos of result.positions) {
            const label = pos.type === 'save' ? '📈 Saving' : '📉 Borrowing';
            printKeyValue(label, `$${pos.amount.toFixed(2)} ${pos.asset} (${pos.protocol})`);
          }
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
