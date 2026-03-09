import type { Command } from 'commander';
import pc from 'picocolors';
import readline from 'readline';
import { T2000, formatUsd, SUPPORTED_ASSETS } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printInfo,
  printWarning,
  printLine,
  printDivider,
  explorerUrl,
} from '../output.js';

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function registerRebalance(program: Command) {
  program
    .command('rebalance')
    .description('Optimize yield — move savings to the best rate across protocols and stablecoins')
    .option('--key <path>', 'Key file path')
    .option('--dry-run', 'Show what would happen without executing')
    .option('--min-diff <pct>', 'Minimum APY difference to trigger (default: 0.5)', '0.5')
    .option('--max-break-even <days>', 'Max break-even days for cross-asset moves (default: 30)', '30')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const minYieldDiff = parseFloat(opts.minDiff ?? '0.5');
        const maxBreakEven = parseInt(opts.maxBreakEven ?? '30', 10);

        const plan = await agent.rebalance({
          dryRun: true,
          minYieldDiff,
          maxBreakEven,
        });

        if (isJsonMode()) {
          if (opts.dryRun) {
            printJson(plan);
          } else {
            const result = await agent.rebalance({ dryRun: false, minYieldDiff, maxBreakEven });
            printJson(result);
          }
          return;
        }

        printBlank();

        if (plan.steps.length === 0) {
          const diff = plan.newApy - plan.currentApy;
          if (diff < minYieldDiff) {
            printInfo(`Already optimized — ${plan.currentApy.toFixed(2)}% APY on ${plan.fromProtocol}`);
            printLine(pc.dim(`  Best available: ${plan.newApy.toFixed(2)}% (${displayAsset(plan.toAsset)} on ${plan.toProtocol})`));
            printLine(pc.dim(`  Difference: ${diff.toFixed(2)}% (below ${minYieldDiff}% threshold)`));
          } else if (plan.breakEvenDays > maxBreakEven && plan.estimatedSwapCost > 0) {
            printInfo(`Skipped — break-even of ${plan.breakEvenDays} days exceeds ${maxBreakEven}-day limit`);
            printLine(pc.dim(`  ${displayAsset(plan.fromAsset)} on ${plan.fromProtocol} (${plan.currentApy.toFixed(2)}%) → ${displayAsset(plan.toAsset)} on ${plan.toProtocol} (${plan.newApy.toFixed(2)}%)`));
          } else {
            printInfo('Already at the best rate. Nothing to rebalance.');
          }
          printBlank();
          return;
        }

        printLine(pc.bold('Rebalance Plan'));
        printDivider();
        printKeyValue('From', `${displayAsset(plan.fromAsset)} on ${plan.fromProtocol} (${plan.currentApy.toFixed(2)}% APY)`);
        printKeyValue('To', `${displayAsset(plan.toAsset)} on ${plan.toProtocol} (${plan.newApy.toFixed(2)}% APY)`);
        printKeyValue('Amount', formatUsd(plan.amount));
        printBlank();

        printLine(pc.bold('Economics'));
        printDivider();
        printKeyValue('APY Gain', `+${(plan.newApy - plan.currentApy).toFixed(2)}%`);
        printKeyValue('Annual Gain', `${formatUsd(plan.annualGain)}/year`);
        if (plan.estimatedSwapCost > 0) {
          printKeyValue('Swap Cost', `~${formatUsd(plan.estimatedSwapCost)}`);
          printKeyValue('Break-even', `${plan.breakEvenDays} days`);
        }
        printBlank();

        if (plan.steps.length > 0) {
          printLine(pc.bold('Steps'));
          printDivider();
          for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const num = `${i + 1}.`;
            if (step.action === 'withdraw') {
              printLine(`  ${num} Withdraw ${formatUsd(step.amount)} ${displayAsset(step.fromAsset ?? '')} from ${step.protocol}`);
            } else if (step.action === 'swap') {
              printLine(`  ${num} Swap ${displayAsset(step.fromAsset ?? '')} → ${displayAsset(step.toAsset ?? '')} (~${formatUsd(step.estimatedOutput ?? 0)})`);
            } else if (step.action === 'deposit') {
              printLine(`  ${num} Deposit ${formatUsd(step.amount)} ${displayAsset(step.toAsset ?? '')} into ${step.protocol}`);
            }
          }
          printBlank();
        }

        if (opts.dryRun) {
          printLine(pc.bold(pc.yellow('DRY RUN — Preview only, no transactions executed')));
          printLine(pc.dim('  Run `t2000 rebalance` to execute.'));
          printBlank();
          return;
        }

        if (!opts.yes) {
          const proceed = await confirm('Execute this rebalance?');
          if (!proceed) {
            printInfo('Cancelled.');
            printBlank();
            return;
          }
        }

        const result = await agent.rebalance({ dryRun: false, minYieldDiff, maxBreakEven });

        if (result.executed) {
          printSuccess(`Rebalanced ${formatUsd(result.amount)} → ${result.newApy.toFixed(2)}% APY`);
          for (const digest of result.txDigests) {
            printKeyValue('Tx', explorerUrl(digest));
          }
          printKeyValue('Gas', `${result.totalGasCost.toFixed(4)} SUI`);
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

function displayAsset(asset: string): string {
  return SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? asset;
}
