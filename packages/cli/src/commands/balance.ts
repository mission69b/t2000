import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printHeader, printSeparator, printLine } from '../output.js';

interface LimitsData {
  maxWithdraw: string;
  maxBorrow: string;
  healthFactor: number | null;
}

async function fetchLimits(agent: T2000): Promise<LimitsData> {
  const [maxWithdraw, maxBorrow, hf] = await Promise.all([
    agent.maxWithdraw(),
    agent.maxBorrow(),
    agent.healthFactor(),
  ]);

  return {
    maxWithdraw: maxWithdraw.maxAmount.toFixed(2),
    maxBorrow: maxBorrow.maxAmount.toFixed(2),
    healthFactor: hf.borrowed >= 0.01 ? hf.healthFactor : null,
  };
}

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('Show wallet balance')
    .option('--key <path>', 'Key file path')
    .option('--show-limits', 'Include maxWithdraw, maxBorrow, and health factor')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const bal = await agent.balance();

        const limits = opts.showLimits ? await fetchLimits(agent) : undefined;

        if (isJsonMode()) {
          const output = limits
            ? { ...bal, limits }
            : bal;
          printJson(output);
          return;
        }

        printBlank();

        const stables = bal.stables ?? {};
        const stableEntries = Object.entries(stables).filter(([, v]) => v >= 0.01);

        if (stableEntries.length <= 1) {
          printKeyValue('Available', `${formatUsd(bal.available)}  ${pc.dim('(checking — spendable)')}`);
        } else {
          printKeyValue('Available', `${formatUsd(bal.available)}  ${pc.dim('(total stablecoins)')}`);
          for (const [symbol, amount] of stableEntries) {
            printLine(`    ${pc.dim(symbol)}  ${formatUsd(amount)}`);
          }
        }

        if (bal.savings > 0.01) {
          const positions = await agent.positions();
          const saves = positions.positions.filter(p => p.type === 'save');
          const borrows = positions.positions.filter(p => p.type === 'borrow');
          const weightedApy = saves.length > 0
            ? saves.reduce((sum, p) => sum + p.amount * p.apy, 0) / saves.reduce((sum, p) => sum + p.amount, 0)
            : 0;
          const dailyEarning = bal.savings * (weightedApy / 100) / 365;
          printKeyValue('Savings', `${formatUsd(bal.savings)}  ${pc.dim(`(earning ${weightedApy.toFixed(2)}% APY)`)}`);
          if (bal.debt > 0.01) {
            const borrowApy = borrows.length > 0
              ? borrows.reduce((sum, p) => sum + p.amount * p.apy, 0) / borrows.reduce((sum, p) => sum + p.amount, 0)
              : 0;
            printKeyValue('Credit', `${pc.red(`-${formatUsd(bal.debt)}`)}  ${pc.dim(`(${borrowApy.toFixed(2)}% APY)`)}`);
          }
          if (bal.investment > 0.01) {
            const pnlColor = bal.investmentPnL >= 0 ? pc.green : pc.red;
            const pnlSign = bal.investmentPnL >= 0 ? '+' : '';
            const pnlPct = bal.investment > 0 ? ((bal.investmentPnL / (bal.investment - bal.investmentPnL)) * 100) : 0;
            let earningInfo = '';
            try {
              const portfolio = await agent.getPortfolio();
              const earningPositions = portfolio.positions.filter(p => p.earning && p.earningApy);
              if (earningPositions.length > 0) {
                const avgApy = earningPositions.reduce((s, p) => s + (p.earningApy ?? 0) * p.currentValue, 0)
                  / earningPositions.reduce((s, p) => s + p.currentValue, 0);
                earningInfo = `, earning ${avgApy.toFixed(1)}% APY`;
              }
            } catch { /* skip */ }
            printKeyValue('Investment', `${formatUsd(bal.investment)}  ${pnlColor(`(${pnlSign}${pnlPct.toFixed(1)}%${earningInfo})`)}`);
          } else {
            printKeyValue('Investment', pc.dim('—'));
          }
          printSeparator();
          printKeyValue('Total', `${formatUsd(bal.total)}`);
          if (dailyEarning >= 0.005) {
            printLine(`  ${pc.dim(`Earning ~${formatUsd(dailyEarning)}/day`)}`);
          }
        } else {
          if (bal.debt > 0.01) {
            printKeyValue('Credit', `${pc.red(`-${formatUsd(bal.debt)}`)}`);
          }
          printKeyValue('Savings', `${formatUsd(bal.savings)}`);
          if (bal.investment > 0.01) {
            const pnlColor = bal.investmentPnL >= 0 ? pc.green : pc.red;
            const pnlSign = bal.investmentPnL >= 0 ? '+' : '';
            const pnlPct = bal.investment > 0 ? ((bal.investmentPnL / (bal.investment - bal.investmentPnL)) * 100) : 0;
            let earningInfo = '';
            try {
              const portfolio = await agent.getPortfolio();
              const earningPositions = portfolio.positions.filter(p => p.earning && p.earningApy);
              if (earningPositions.length > 0) {
                const avgApy = earningPositions.reduce((s, p) => s + (p.earningApy ?? 0) * p.currentValue, 0)
                  / earningPositions.reduce((s, p) => s + p.currentValue, 0);
                earningInfo = `, earning ${avgApy.toFixed(1)}% APY`;
              }
            } catch { /* skip */ }
            printKeyValue('Investment', `${formatUsd(bal.investment)}  ${pnlColor(`(${pnlSign}${pnlPct.toFixed(1)}%${earningInfo})`)}`);
          } else {
            printKeyValue('Investment', pc.dim('—'));
          }
          printSeparator();
          printKeyValue('Total', `${formatUsd(bal.total)}`);
        }

        if (limits) {
          printBlank();
          printHeader('Limits');
          printKeyValue('Max withdraw', `${formatUsd(Number(limits.maxWithdraw))} USDC`, 4);
          printKeyValue('Max borrow', `${formatUsd(Number(limits.maxBorrow))} USDC`, 4);
          const hfDisplay = limits.healthFactor !== null
            ? limits.healthFactor.toFixed(2)
            : `${pc.green('∞')}  ${pc.dim('(no active loan)')}`;
          printKeyValue('Health factor', hfDisplay, 4);
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
