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
    healthFactor: hf.borrowed > 0 ? hf.healthFactor : null,
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
        const stableEntries = Object.entries(stables).filter(([, v]) => v > 0.001);

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
          const weightedApy = saves.length > 0
            ? saves.reduce((sum, p) => sum + p.amount * p.apy, 0) / saves.reduce((sum, p) => sum + p.amount, 0)
            : 0;
          const dailyEarning = bal.savings * (weightedApy / 100) / 365;
          printKeyValue('Savings', `${formatUsd(bal.savings)}  ${pc.dim(`(earning ${weightedApy.toFixed(2)}% APY)`)}`);
          printKeyValue('Gas', `${bal.gasReserve.sui.toFixed(2)} SUI    ${pc.dim(`(~${formatUsd(bal.gasReserve.usdEquiv)})`)}`);
          printSeparator();
          printKeyValue('Total', `${formatUsd(bal.total)}`);
          if (dailyEarning >= 0.005) {
            printLine(`  ${pc.dim(`Earning ~${formatUsd(dailyEarning)}/day`)}`);
          }
        } else {
          printKeyValue('Savings', `${formatUsd(bal.savings)}`);
          printKeyValue('Gas', `${bal.gasReserve.sui.toFixed(2)} SUI    ${pc.dim(`(~${formatUsd(bal.gasReserve.usdEquiv)})`)}`);
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
