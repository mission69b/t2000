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
    .description('Show all earning opportunities — savings yield + investment yield')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const [positionsResult, portfolioResult, ratesResult] = await Promise.allSettled([
          agent.positions(),
          agent.getPortfolio(),
          agent.allRates('USDC'),
        ]);

        const posData = positionsResult.status === 'fulfilled' ? positionsResult.value : null;
        const portfolio = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
        const ratesData = ratesResult.status === 'fulfilled' ? ratesResult.value : null;
        const savePositions = posData?.positions.filter((p) => p.type === 'save') ?? [];
        const totalSaved = savePositions.reduce((s, p) => s + p.amount, 0);
        const earningInvestments = portfolio?.positions.filter((p) => p.earning && p.currentValue > 0) ?? [];
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
            investments: earningInvestments.map((p) => ({
              asset: p.asset,
              amount: p.totalAmount,
              value: p.currentValue,
              protocol: p.earningProtocol,
              apy: p.earningApy,
            })),
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

        // --- Investment yield section ---
        if (earningInvestments.length > 0) {
          printBlank();
          printLine(pc.bold('INVESTMENTS') + pc.dim(' — Earning Yield'));
          printDivider();

          let totalInvestValue = 0;
          for (const pos of earningInvestments) {
            const dailyYield = (pos.currentValue * (pos.earningApy ?? 0) / 100) / 365;
            const apyStr = pos.earningApy ? `${pos.earningApy.toFixed(2)}%` : '—';
            printKeyValue(
              `${pos.asset} via ${pos.earningProtocol ?? 'unknown'}`,
              `${formatUsd(pos.currentValue)} (${pos.totalAmount.toFixed(4)} ${pos.asset}) @ ${apyStr} APY`,
            );
            if (dailyYield > 0.0001) {
              const dailyStr = dailyYield < 0.01 ? `$${dailyYield.toFixed(4)}` : formatUsd(dailyYield);
              const monthlyStr = dailyYield * 30 < 0.01 ? `$${(dailyYield * 30).toFixed(4)}` : formatUsd(dailyYield * 30);
              printLine(pc.dim(`    ~${dailyStr}/day · ~${monthlyStr}/month`));
            }
            totalInvestValue += pos.currentValue;
          }

          if (earningInvestments.length > 1) {
            printBlank();
            printKeyValue('Total Earning', formatUsd(totalInvestValue));
          }
        }

        printBlank();

        // --- Quick actions ---
        printLine(pc.bold('Quick Actions'));
        printDivider();
        printLine(`  ${pc.dim('t2000 save <amount> [asset]')}     Save stablecoins for yield`);
        printLine(`  ${pc.dim('t2000 invest earn <asset>')}     Earn yield on investments`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
