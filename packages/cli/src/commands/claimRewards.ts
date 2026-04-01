import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printSeparator, printLine } from '../output.js';

export function registerClaimRewards(program: Command) {
  program
    .command('claim-rewards')
    .description('Claim pending protocol rewards')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.claimRewards();

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();

        if (result.rewards.length === 0) {
          printLine(`  ${pc.dim('No rewards to claim')}`);
          printBlank();
          return;
        }

        const protocols = [...new Set(result.rewards.map(r => r.protocol))];
        printLine(`  ${pc.green('✓')} Claimed rewards`);
        printSeparator();

        const received = result.totalValueUsd;
        if (received >= 0.01) {
          printKeyValue('Value', `${pc.green(formatUsd(received))}`);
        } else if (received > 0) {
          printKeyValue('Value', `${pc.green('< $0.01')}`);
        } else {
          printKeyValue('Value', `${pc.dim('< $0.01 (rewards are still accruing)')}`);
        }
        printKeyValue('Source', protocols.join(', '));

        if (result.tx) {
          printKeyValue('Tx', `https://suiscan.xyz/mainnet/tx/${result.tx}`);
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
