import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import {
  printHeader,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printDivider,
  printLine,
  printInfo,
} from '../output.js';
import pc from 'picocolors';

export function registerEarn(program: Command) {
  program
    .command('earn')
    .description('Show all earning opportunities — savings yield')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const [positionsResult, ratesResult] = await Promise.allSettled([
          agent.positions(),
          agent.allRates('USDC'),
        ]);

        const posData = positionsResult.status === 'fulfilled' ? positionsResult.value : null;
        const ratesData = ratesResult.status === 'fulfilled' ? ratesResult.value : null;
        const savePositions = posData?.positions.filter((p) => p.type === 'save') ?? [];
        const totalSaved = savePositions.reduce((s, p) => s + p.amount, 0);
        const bestSaveApy = ratesData?.length
          ? Math.max(...ratesData.map(r => r.rates.saveApy))
          : 0;

        if (isJsonMode()) {
          printJson({
            savings: savePositions.map((p) => ({
              protocol: p.protocol,
              asset: p.asset,
              amount: p.amount,
              apy: p.apy,
            })),
            totalSaved,
            availableRates: ratesData?.map(r => ({
              protocol: r.protocol,
              asset: 'USDC',
              saveApy: r.rates.saveApy,
            })) ?? [],
          });
          return;
        }

        printHeader('Earning Opportunities');

        // --- Savings section ---
        printLine(pc.bold('SAVINGS') + pc.dim(' — Passive Yield'));
        printDivider();

        if (savePositions.length > 0) {
          for (const pos of savePositions) {
            const dailyYield = (pos.amount * pos.apy / 100) / 365;
            printKeyValue(pos.protocol, `${formatUsd(pos.amount)} ${pos.asset} @ ${pos.apy.toFixed(2)}% APY`);
            if (dailyYield > 0.0001) {
              const dailyStr = dailyYield < 0.01 ? `$${dailyYield.toFixed(4)}` : formatUsd(dailyYield);
              const monthlyStr = dailyYield * 30 < 0.01 ? `$${(dailyYield * 30).toFixed(4)}` : formatUsd(dailyYield * 30);
              printLine(pc.dim(`    ~${dailyStr}/day · ~${monthlyStr}/month`));
            }
          }
          if (savePositions.length > 1) {
            printBlank();
            printKeyValue('Total Saved', formatUsd(totalSaved));
          }
        } else if (ratesData && ratesData.length > 0) {
          const sorted = [...ratesData].sort((a, b) => b.rates.saveApy - a.rates.saveApy);
          for (const r of sorted) {
            printKeyValue(r.protocol, `USDC @ ${r.rates.saveApy.toFixed(2)}% APY`);
          }
          const example = 100;
          const daily = (example * bestSaveApy / 100) / 365;
          const monthly = daily * 30;
          printLine(pc.dim(`    Save $${example} → ~$${daily.toFixed(2)}/day · ~$${monthly.toFixed(2)}/month`));
          printBlank();
          printInfo('No savings yet — run `t2000 save <amount>` to start');
        } else if (posData) {
          printInfo('No savings yet — run `t2000 save <amount>` to start');
        } else {
          printInfo('Savings data unavailable');
        }

        printBlank();

        printLine(pc.bold('Quick Actions'));
        printDivider();
        printLine(`  ${pc.dim('t2000 save <amount> [asset]')}     Save stablecoins for yield`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
