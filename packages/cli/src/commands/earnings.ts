import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

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
        printKeyValue('Total Saved', `$${result.supplied.toFixed(2)}`);

        if (savePositions.length > 0) {
          for (const p of savePositions) {
            console.log(`    ${pc.dim('•')} $${p.amount.toFixed(2)} ${p.asset} on ${p.protocol} @ ${p.apy.toFixed(1)}% APY`);
          }
        }

        printKeyValue('Blended APY', `${result.currentApy.toFixed(2)}%`);
        printKeyValue('Daily Yield', `~$${result.dailyEarning.toFixed(4)}/day`);
        printKeyValue('Est. Earned', `~$${result.totalYieldEarned.toFixed(4)}`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
