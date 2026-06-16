import pc from 'picocolors';
import { Command } from 'commander';
import { formatUsd } from '@t2000/sdk';
import { withAgent } from '../lib/with-agent.js';
import {
  printKeyValue,
  printBlank,
  printJson,
  printLine,
  isJsonMode,
  handleError,
  printSeparator,
} from '../output.js';

/** Trim a token amount to ≤6 dp without trailing-zero noise. */
function formatTokenAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: false });
}

export interface BalanceOptions {
  key?: string;
}

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('Show all wallet holdings — USDC / USDsui / SUI (USD-priced) + any other tokens (amount-only)')
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
            tokens: bal.tokens,
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

        if (bal.sui && bal.sui.amount > 0) {
          printKeyValue(
            'SUI',
            `${formatUsd(bal.sui.usdValue)}  ${pc.dim(`(${bal.sui.amount.toFixed(4)} SUI · gas)`)}`,
          );
        }

        // Other held tokens — amount-only (no USD price oracle for arbitrary tokens).
        const tokens = bal.tokens ?? [];
        for (const t of tokens) {
          printKeyValue(t.symbol.padEnd(8), pc.dim(formatTokenAmount(t.amount)));
        }

        printSeparator();
        printKeyValue('Wallet total', `${formatUsd(bal.totalUsd)}  ${pc.dim('(priced holdings)')}`);
        if (tokens.length > 0) {
          printLine(
            pc.dim(
              `  + ${tokens.length} token${tokens.length === 1 ? '' : 's'} above with no USD price — not counted in the total`,
            ),
          );
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
