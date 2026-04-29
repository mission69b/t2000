import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerStake(program: Command) {
  program
    .command('stake')
    .description('Stake SUI for vSUI via VOLO liquid staking (earn ~3-5% APY)')
    .argument('<amount>', 'Amount of SUI to stake (minimum 1)')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr: string, opts: { key?: string }) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount < 1) {
          throw new Error('Amount must be at least 1 SUI');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.stakeVSui({ amount });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Staked ${pc.yellow(String(result.amountSui))} SUI for ${pc.green(result.vSuiReceived.toFixed(4))} vSUI`);
        printSuccess(`APY: ${pc.green(`${(result.apy * 100).toFixed(2)}%`)}`);
        printKeyValue('Gas', `${result.gasCost.toFixed(4)} SUI`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
