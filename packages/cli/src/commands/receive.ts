import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printHeader, printKeyValue, printBlank, printJson, isJsonMode, handleError, printLine, printDivider } from '../output.js';
import pc from 'picocolors';

export function registerReceive(program: Command) {
  program
    .command('receive')
    .description('Generate a payment request with address and QR code')
    .option('--amount <number>', 'Amount to request')
    .option('--currency <symbol>', 'Currency (default: USDC)', 'USDC')
    .option('--memo <text>', 'Payment note')
    .option('--label <text>', 'Description for the request')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { amount?: string; currency?: string; memo?: string; label?: string; key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const amount = opts.amount ? parseFloat(opts.amount) : undefined;
        if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number');
        }

        const request = agent.receive({
          amount,
          currency: opts.currency,
          memo: opts.memo,
          label: opts.label,
        });

        if (isJsonMode()) {
          printJson(request);
          return;
        }

        printHeader('Payment Request');

        if (request.label) {
          printLine(pc.bold(request.label));
          printBlank();
        }

        if (request.amount != null) {
          printLine(pc.bold(`  $${request.amount.toFixed(2)} ${request.currency}`));
        } else {
          printLine(pc.dim('  Any amount') + ` ${request.currency}`);
        }
        printBlank();

        printDivider();
        printKeyValue('Address', request.address);
        printKeyValue('Network', 'Sui Mainnet');
        printKeyValue('Nonce', request.nonce);
        if (request.memo) {
          printKeyValue('Memo', request.memo);
        }
        printDivider();

        printBlank();
        printKeyValue('Payment URI', request.qrUri);
        printBlank();

        printLine(pc.dim('Share this URI or scan the QR to pay via any Sui wallet.'));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
