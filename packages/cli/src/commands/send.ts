import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';
import { truncateAddress, formatUsd } from '@t2000/sdk';

const KNOWN_ASSETS = new Set(['USDC', 'USDT', 'USDE', 'USDSUI', 'SUI']);

export function parseSendArgs(args: string[]): { amount: number; asset: string; recipient: string } {
  const filtered = args.filter(a => a.toLowerCase() !== 'to');
  if (filtered.length >= 3 && KNOWN_ASSETS.has(filtered[1].toUpperCase())) {
    return { amount: parseFloat(filtered[0]), asset: filtered[1].toUpperCase(), recipient: filtered[2] };
  }
  if (filtered.length >= 2) {
    return { amount: parseFloat(filtered[0]), asset: 'USDC', recipient: filtered[filtered.length - 1] };
  }
  throw new Error('Usage: t2000 send <amount> [asset] [to] <address_or_contact>');
}

export function registerSend(program: Command) {
  program
    .command('send')
    .argument('<amount>', 'Amount to send')
    .argument('[args...]', 'Asset, "to" keyword, and recipient address or contact name')
    .description('Send USDC (or other asset) to an address or contact name')
    .option('--key <path>', 'Key file path')
    .action(async (amount: string, args: string[], opts: { key?: string }) => {
      try {
        const { amount: parsedAmount, asset, recipient } = parseSendArgs([amount, ...args]);
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.send({
          to: recipient,
          amount: parsedAmount,
          asset,
        });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        const displayTo = result.contactName
          ? `${result.contactName} (${truncateAddress(result.to)})`
          : truncateAddress(result.to);
        printSuccess(`Sent ${formatUsd(result.amount)} ${asset.toUpperCase()} → ${displayTo}`);
        printKeyValue('Gas', `${result.gasCost.toFixed(4)} ${result.gasCostUnit} (${result.gasMethod})`);
        printKeyValue('Balance', formatUsd(result.balance.available) + ' USDC');
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
