import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, getGasStatus } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import {
  printHeader,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printDivider,
  printInfo,
  printLine,
} from '../output.js';

export function registerGas(program: Command) {
  program
    .command('gas')
    .description('Check gas station status and wallet gas balance')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const address = agent.address();

        const [status, bal] = await Promise.allSettled([
          getGasStatus(address),
          agent.balance(),
        ]);

        const gasStatus = status.status === 'fulfilled' ? status.value : null;
        const balData = bal.status === 'fulfilled' ? bal.value : null;

        if (isJsonMode()) {
          printJson({
            gasStation: gasStatus ?? { error: status.status === 'rejected' ? String((status as PromiseRejectedResult).reason) : 'unavailable' },
            wallet: balData ? { sui: balData.gasReserve.sui, available: balData.available } : null,
          });
          return;
        }

        printHeader('Gas Status');

        if (gasStatus) {
          const cbStatus = gasStatus.circuitBreaker
            ? pc.red('TRIPPED — sponsorship paused')
            : pc.green('OK');
          printKeyValue('Gas Station', cbStatus);
          printKeyValue('SUI Price (TWAP)', `$${gasStatus.suiPrice.toFixed(4)}`);
          if (gasStatus.bootstrapRemaining !== undefined) {
            printKeyValue('Bootstrap', `${gasStatus.bootstrapUsed}/10 used (${gasStatus.bootstrapRemaining} remaining)`);
          }
        } else {
          printKeyValue('Gas Station', pc.red('unreachable'));
          const reason = status.status === 'rejected'
            ? (status as PromiseRejectedResult).reason
            : 'unknown';
          printLine(`  ${pc.dim(reason instanceof Error ? reason.message : String(reason))}`);
        }

        printDivider();

        if (balData) {
          const suiBal = balData.gasReserve.sui;
          const suiColor = suiBal < 0.05 ? pc.red : pc.green;
          printKeyValue('SUI (gas)', suiColor(`${suiBal.toFixed(4)} SUI`));
          if (suiBal < 0.05) {
            printLine(`  ${pc.yellow('⚠')} Below gas threshold (0.05 SUI) — transactions will need sponsorship`);
          }
          printKeyValue('Available', `$${balData.available.toFixed(2)}`);
        } else {
          printKeyValue('Wallet', pc.dim('could not fetch balances'));
        }

        printBlank();

        if (gasStatus && !gasStatus.circuitBreaker && (balData?.gasReserve.sui ?? 0) >= 0.05) {
          printLine(`  ${pc.green('✓')} Gas is healthy — transactions should succeed`);
        } else if (gasStatus && !gasStatus.circuitBreaker) {
          printLine(`  ${pc.yellow('⚠')} Low SUI but gas station is online — sponsorship available`);
        } else {
          printLine(`  ${pc.red('✗')} Gas station issues detected — fund wallet with SUI directly`);
          printInfo('Send SUI to your address: t2000 address');
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
