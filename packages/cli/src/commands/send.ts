import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';
import { truncateAddress, formatUsd } from '@t2000/sdk';

export function registerSend(program: Command) {
  program
    .command('send <amount> <asset> [to_keyword] <address>')
    .description('Send USDC (or other asset) to an address')
    .option('--key <path>', 'Key file path')
    .action(async (amount: string, asset: string, toOrAddress: string, address: string | undefined, opts: { key?: string }) => {
      try {
        const recipient = address ?? toOrAddress;
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.send({
          to: recipient,
          amount: parseFloat(amount),
          asset: asset.toUpperCase(),
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
