import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, truncateAddress } from '@t2000/sdk';
import type { TransactionRecord } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printHeader, printBlank, printJson, isJsonMode, handleError, printLine, printInfo, printDivider, printKeyValue, explorerUrl } from '../output.js';

const ACTION_LABELS: Record<string, string> = {
  send: '↗ send',
  lending: '🏦 lend',
  swap: '🔄 swap',
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

function formatAmount(tx: TransactionRecord): string {
  if (!tx.amount) return '';
  return pc.bold(`${tx.amount.toFixed(tx.amount < 0.01 ? 4 : 2)} ${tx.asset ?? ''}`);
}

function printTxSummary(tx: TransactionRecord) {
  const label = ACTION_LABELS[tx.action] ?? `📦 ${tx.action}`;
  const time = tx.timestamp ? relativeTime(tx.timestamp) : '';
  const amount = formatAmount(tx);
  const recipient = tx.recipient ? pc.dim(`→ ${truncateAddress(tx.recipient)}`) : '';
  const link = pc.dim(explorerUrl(tx.digest));

  printLine(`${label}  ${amount}  ${recipient}`);
  printLine(`  ${pc.dim(truncateAddress(tx.digest))}  ${pc.dim(time)}`);
  printLine(`  ${link}`);
}

function printTxDetail(tx: TransactionRecord) {
  printHeader('Transaction Detail');

  const label = ACTION_LABELS[tx.action] ?? `📦 ${tx.action}`;
  printKeyValue('Type', label);
  printKeyValue('Digest', tx.digest);
  if (tx.amount) printKeyValue('Amount', `${tx.amount.toFixed(tx.amount < 0.01 ? 6 : 4)} ${tx.asset ?? ''}`);
  if (tx.recipient) printKeyValue('Recipient', tx.recipient);
  if (tx.timestamp) {
    printKeyValue('Time', `${new Date(tx.timestamp).toLocaleString()} (${relativeTime(tx.timestamp)})`);
  }
  if (tx.gasCost !== undefined) printKeyValue('Gas', `${tx.gasCost.toFixed(6)} SUI`);
  printBlank();
  printKeyValue('Explorer', explorerUrl(tx.digest));
  printBlank();
}

export function registerHistory(program: Command) {
  program
    .command('history')
    .description('Show transaction history, or detail for a specific digest')
    .argument('[digest]', 'Transaction digest to view details')
    .option('--limit <n>', 'Number of transactions', '20')
    .option('--key <path>', 'Key file path')
    .action(async (digest: string | undefined, opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        if (digest) {
          const tx = await agent.transactionDetail(digest);
          if (!tx) {
            handleError(new Error(`Transaction not found: ${digest}`));
            return;
          }
          if (isJsonMode()) {
            printJson(tx);
            return;
          }
          printTxDetail(tx);
          return;
        }

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
            printTxSummary(tx);
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
