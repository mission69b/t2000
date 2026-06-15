import pc from 'picocolors';
import { Command } from 'commander';
import { formatUsd } from '@t2000/sdk';
import { withAgent } from '../lib/with-agent.js';
import {
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printSeparator,
} from '../output.js';

export interface BalanceOptions {
  key?: string;
}

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('Show stablecoin + SUI holdings (USDC, USDsui, SUI; wallet only)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: BalanceOptions) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const bal = await agent.balance();

        if (isJsonMode()) {
          printJson({
            available: bal.available,
            stables: bal.stables,
            sui: bal.sui,
            totalUsd: bal.totalUsd,
          });
          return;
        }

        printBlank();

        const stables = bal.stables ?? {};
        const stableEntries = Object.entries(stables)
          .filter(([, v]) => v >= 0.01)
          .sort(([a], [b]) => (a === 'USDC' ? -1 : b === 'USDC' ? 1 : a.localeCompare(b)));

        if (stableEntries.length === 0) {
          printKeyValue('Stablecoins', `${pc.dim('none')}`);
        } else {
          for (const [symbol, amount] of stableEntries) {
            const label = symbol.padEnd(8);
            printKeyValue(label, formatUsd(amount));
          }
        }

        if (bal.sui && bal.sui.usdValue >= 0.001) {
          printKeyValue(
            'SUI',
            `${formatUsd(bal.sui.usdValue)}  ${pc.dim(`(${bal.sui.amount.toFixed(4)} SUI — for swaps)`)}`,
          );
        }

        printSeparator();
        printKeyValue('Wallet total', formatUsd(bal.totalUsd));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
