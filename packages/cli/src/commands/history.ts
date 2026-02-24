import type { Command } from 'commander';
import { T2000, truncateAddress } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
import { printHeader, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerHistory(program: Command) {
  program
    .command('history')
    .description('Show transaction history')
    .option('--limit <n>', 'Number of transactions', '20')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

        const txns = await agent.history({ limit: parseInt(opts.limit, 10) });

        if (isJsonMode()) {
          printJson(txns);
          return;
        }

        printHeader('Transaction History');

        if (txns.length === 0) {
          console.log('  No transactions yet.');
        } else {
          for (const tx of txns) {
            const time = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'unknown';
            const gas = tx.gasCost ? ` (gas: ${tx.gasCost.toFixed(4)} SUI)` : '';
            console.log(`  ${truncateAddress(tx.digest)}  ${tx.action}${gas}  ${time}`);
          }
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
