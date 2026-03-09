import type { Command } from 'commander';
import pc from 'picocolors';
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
        const pos = await agent.positions();
        const savePositions = pos.positions.filter((p) => p.type === 'save');

        if (isJsonMode()) {
          printJson({ ...result, positions: savePositions });
          return;
        }

        printBlank();
        if (result.supplied > 0) {
          printSuccess('Savings: ACTIVE');
        } else {
          console.log('  Savings: INACTIVE — run `t2000 save <amount>` to start earning');
        }
        printBlank();
        printKeyValue('Total Saved', `$${result.supplied.toFixed(2)}`);

        if (savePositions.length > 0) {
          for (const p of savePositions) {
            console.log(`    ${pc.dim('•')} $${p.amount.toFixed(2)} ${p.asset} on ${p.protocol} @ ${p.apy.toFixed(1)}% APY`);
          }
        }

        printKeyValue('Blended APY', `${result.apy.toFixed(1)}%`);
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
