import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerFundStatus(program: Command) {
  program
    .command('fund-status')
    .description('Full savings summary')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.fundStatus();

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        if (result.supplied > 0) {
          printSuccess('Savings: ACTIVE');
        } else {
          console.log('  Savings: INACTIVE — deposit USDC and run `t2000 save`');
        }
        printBlank();
        printKeyValue('Saved', `$${result.supplied.toFixed(2)} USDC @ ${result.apy.toFixed(1)}% APY`);
        printKeyValue('Earned today', `~$${result.earnedToday.toFixed(4)}`);
        printKeyValue('Earned all time', `~$${result.earnedAllTime.toFixed(4)}`);
        printKeyValue('Monthly projected', `~$${result.projectedMonthly.toFixed(2)}/month`);
        printBlank();
        if (result.supplied > 0) {
          console.log('  Withdraw anytime: t2000 withdraw <amount>');
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
