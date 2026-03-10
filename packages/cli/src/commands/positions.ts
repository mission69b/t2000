import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printInfo, printLine, printDivider } from '../output.js';

export function registerPositions(program: Command) {
  program
    .command('positions')
    .description('Show savings & borrow positions across all protocols and assets')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.positions();

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        if (result.positions.length === 0) {
          printInfo('No positions. Use `t2000 save <amount>` to start earning.');
        } else {
          const saves = result.positions.filter(p => p.type === 'save');
          const borrows = result.positions.filter(p => p.type === 'borrow');

          if (saves.length > 0) {
            printLine(pc.bold('Savings'));
            printDivider();
            for (const pos of saves) {
              printKeyValue(pos.protocol, `${formatUsd(pos.amount)} ${pos.asset} @ ${pos.apy.toFixed(2)}% APY`);
            }
            const totalSaved = saves.reduce((s, p) => s + p.amount, 0);
            if (saves.length > 1) {
              printKeyValue('Total', formatUsd(totalSaved));
            }
            printBlank();
          }

          if (borrows.length > 0) {
            printLine(pc.bold('Borrows'));
            printDivider();
            for (const pos of borrows) {
              printKeyValue(pos.protocol, `${formatUsd(pos.amount)} ${pos.asset} @ ${pos.apy.toFixed(2)}% APY`);
            }
            const totalBorrowed = borrows.reduce((s, p) => s + p.amount, 0);
            if (borrows.length > 1) {
              printKeyValue('Total', formatUsd(totalBorrowed));
            }
            printBlank();
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
}
