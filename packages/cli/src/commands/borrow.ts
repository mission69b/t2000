import type { Command } from 'commander';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning, explorerUrl } from '../output.js';

type BorrowAsset = 'USDC' | 'USDsui';
const BORROW_ASSETS: readonly BorrowAsset[] = ['USDC', 'USDsui'] as const;

function resolveBorrowAsset(input: string | undefined): BorrowAsset {
  if (!input) return 'USDC';
  const match = BORROW_ASSETS.find((a) => a.toLowerCase() === input.toLowerCase());
  if (!match) {
    throw new Error(`--asset must be one of: ${BORROW_ASSETS.join(', ')}. Got: "${input}"`);
  }
  return match;
}

export function registerBorrow(program: Command) {
  program
    .command('borrow')
    .description('Borrow USDC or USDsui against savings collateral')
    .argument('<amount>', 'Amount to borrow (in units of the chosen asset)')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <symbol>', 'Asset to borrow: USDC (default) or USDsui')
    .action(async (amountStr, opts) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        const asset = resolveBorrowAsset(opts.asset);

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const maxResult = await agent.maxBorrow();
        if (amount > maxResult.maxAmount) {
          printWarning(`Max safe borrow: ${formatUsd(maxResult.maxAmount)} (HF ${maxResult.currentHF.toFixed(2)} → min 1.5)`);
          return;
        }

        const result = await agent.borrow({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Borrowed ${formatUsd(amount)} ${asset}`);
        printKeyValue('Health Factor', result.healthFactor.toFixed(2));
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
