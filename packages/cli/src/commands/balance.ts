import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printHeader } from '../output.js';

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
        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

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
        printKeyValue('Available', `${formatUsd(bal.available)} USDC`);
        if (bal.savings > 0) {
          printKeyValue('Savings', `${formatUsd(bal.savings)} USDC`);
        }
        printKeyValue('Gas reserve', `${bal.gasReserve.sui.toFixed(4)} SUI (~${formatUsd(bal.gasReserve.usdEquiv)})`);
        printKeyValue('Total', formatUsd(bal.total));

        if (limits) {
          printBlank();
          printHeader('Limits');
          printKeyValue('Max withdraw', `${formatUsd(Number(limits.maxWithdraw))} USDC`, 4);
          printKeyValue('Max borrow', `${formatUsd(Number(limits.maxBorrow))} USDC`, 4);
          const hfDisplay = limits.healthFactor !== null
            ? limits.healthFactor.toFixed(2)
            : '∞ (no active loan)';
          printKeyValue('Health factor', hfDisplay, 4);
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
