import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd, getRates } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
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

        let apyStr = '';
        if (bal.savings > 0) {
          try {
            const rates = await getRates(agent.suiClient);
            const apy = rates.USDC.saveApy;
            apyStr = `  ${pc.dim(`(earning ${apy.toFixed(2)}% APY)`)}`;
          } catch { /* rates unavailable */ }
        }

        printBlank();
        printKeyValue('Available', `${formatUsd(bal.available)} USDC  ${pc.dim('(checking — spendable)')}`);
        printKeyValue('Savings', `${formatUsd(bal.savings)} USDC${apyStr}`);
        printKeyValue('Gas', `${bal.gasReserve.sui.toFixed(2)} SUI    ${pc.dim(`(~${formatUsd(bal.gasReserve.usdEquiv)})`)}`);
        printSeparator();
        printKeyValue('Total', `${formatUsd(bal.total)} USDC`);

        if (bal.savings > 0 && apyStr) {
          try {
            const rates = await getRates(agent.suiClient);
            const dailyEarning = (bal.savings * rates.USDC.saveApy / 100) / 365;
            if (dailyEarning > 0.001) {
              printLine(pc.dim(`Earning ~${formatUsd(dailyEarning)}/day`));
            }
          } catch { /* skip daily earning */ }
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
