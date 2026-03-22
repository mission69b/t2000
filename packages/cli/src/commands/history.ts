import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, truncateAddress } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printHeader, printBlank, printJson, isJsonMode, handleError, printLine, printInfo, printDivider, explorerUrl } from '../output.js';

const ACTION_LABELS: Record<string, string> = {
  send: '↗ send',
  lending: '🏦 lend',
  swap: '🔄 swap',
  'mpp payment': '💳 mpp',
  split: '✂ split',
  transaction: '📦 tx',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function registerHistory(program: Command) {
  program
    .command('history')
    .description('Show transaction history')
    .option('--limit <n>', 'Number of transactions', '20')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const txns = await agent.history({ limit: parseInt(opts.limit, 10) });

        if (isJsonMode()) {
          printJson(txns);
          return;
        }

        printHeader('Transaction History');

        if (txns.length === 0) {
          printInfo('No transactions yet.');
        } else {
          for (const tx of txns) {
            const label = ACTION_LABELS[tx.action] ?? `📦 ${tx.action}`;
            const time = tx.timestamp ? relativeTime(tx.timestamp) : '';
            const amount = tx.amount
              ? pc.bold(`${tx.amount.toFixed(tx.amount < 0.01 ? 4 : 2)} ${tx.asset ?? ''}`)
              : '';
            const recipient = tx.recipient
              ? pc.dim(`→ ${truncateAddress(tx.recipient)}`)
              : '';
            const link = pc.dim(explorerUrl(tx.digest));

            printLine(`${label}  ${amount}  ${recipient}`);
            printLine(`  ${pc.dim(truncateAddress(tx.digest))}  ${pc.dim(time)}`);
            printLine(`  ${link}`);
            printBlank();
          }
        }

        printDivider();
        printInfo(`${txns.length} transaction${txns.length === 1 ? '' : 's'} shown`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
