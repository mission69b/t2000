import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printLine } from '../output.js';

export function registerEarnings(program: Command) {
  program
    .command('earnings')
    .description('Show yield earned to date')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.earnings();
        const pos = await agent.positions();
        const savePositions = pos.positions.filter((p) => p.type === 'save');

        if (isJsonMode()) {
          printJson({ ...result, positions: savePositions });
          return;
        }

        printBlank();
        printKeyValue('Total Saved', formatUsd(result.supplied));

        if (savePositions.length > 0) {
          for (const p of savePositions) {
            printLine(`  ${pc.dim('•')} ${formatUsd(p.amount)} ${p.asset} on ${p.protocol} @ ${p.apy.toFixed(2)}% APY`);
          }
        }

        printKeyValue('Blended APY', `${result.currentApy.toFixed(2)}%`);
        printKeyValue('Daily Yield', `~${formatUsd(result.dailyEarning)}/day`);
        printKeyValue('Est. Earned', `~${formatUsd(result.totalYieldEarned)}`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
