import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerUnstake(program: Command) {
  program
    .command('unstake')
    .description('Unstake vSUI back to SUI (returns SUI including accumulated yield)')
    .argument('<amount>', 'Amount of vSUI to unstake (or "all")')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr: string, opts: { key?: string }) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.unstakeVSui({ amount });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Unstaked ${pc.yellow(result.vSuiAmount.toFixed(4))} vSUI`);
        printSuccess(`Received ${pc.green(result.suiReceived.toFixed(4))} SUI`);
        printKeyValue('Gas', `${result.gasCost.toFixed(4)} SUI (${result.gasMethod})`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
