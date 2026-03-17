import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd, formatAssetAmount } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printInfo, printLine } from '../output.js';

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
          printInfo('Savings: INACTIVE — run `t2000 save <amount>` to start earning');
        }
        printBlank();
        printKeyValue('Total Saved', formatUsd(result.supplied));

        if (savePositions.length > 0) {
          for (const p of savePositions) {
            printLine(`  ${pc.dim('•')} ${formatAssetAmount(p.amount, p.asset)} ${p.asset} (${formatUsd(p.amountUsd ?? p.amount)}) on ${p.protocol} @ ${p.apy.toFixed(2)}% APY`);
          }
        }

        printKeyValue('Blended APY', `${result.apy.toFixed(2)}%`);
        printKeyValue('Earned today', `~${formatUsd(result.earnedToday)}`);
        printKeyValue('Earned all time', `~${formatUsd(result.earnedAllTime)}`);
        printKeyValue('Monthly projected', `~${formatUsd(result.projectedMonthly)}/month`);
        printBlank();
        if (result.supplied > 0) {
          printInfo('Withdraw anytime: t2000 withdraw <amount>');
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
