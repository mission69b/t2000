import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { resolvePin, askConfirm } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning, explorerUrl } from '../output.js';

export function registerBorrow(program: Command) {
  program
    .command('borrow')
    .description('Borrow USDC against savings collateral')
    .argument('<amount>', 'Amount in USDC to borrow')
    .argument('[asset]', 'Asset symbol (default: USDC)', 'USDC')
    .option('--key <path>', 'Key file path')
    .action(async (amountStr, assetStr, opts) => {
      try {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const maxResult = await agent.maxBorrow();
        if (amount > maxResult.maxAmount) {
          printWarning(`Max safe borrow: $${maxResult.maxAmount.toFixed(2)} (HF ${maxResult.currentHF.toFixed(2)} → min 1.5)`);
          return;
        }

        const globalOpts = program.optsWithGlobals();
        if (!globalOpts.yes) {
          const ok = await askConfirm(`Borrow $${amount.toFixed(2)} USDC?`);
          if (!ok) return;
        }

        const asset = assetStr ?? 'USDC';
        const result = await agent.borrow({ amount, asset });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Borrowed $${amount.toFixed(2)} USDC`);
        printKeyValue('Health Factor', result.healthFactor.toFixed(2));
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
