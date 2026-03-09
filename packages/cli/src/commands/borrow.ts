import type { Command } from 'commander';
import { T2000, normalizeAsset, SUPPORTED_ASSETS } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning, explorerUrl } from '../output.js';

export function registerBorrow(program: Command) {
  program
    .command('borrow')
    .description('Borrow stablecoins against savings collateral')
    .argument('<amount>', 'Amount to borrow')
    .argument('[asset]', 'Asset to borrow (USDC, USDT, USDe, USDsui)', 'USDC')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
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

        const asset = assetStr ?? 'USDC';
        const result = await agent.borrow({ amount, asset, protocol: opts.protocol });

        const normalized = normalizeAsset(asset);
        const displayName = SUPPORTED_ASSETS[normalized as keyof typeof SUPPORTED_ASSETS]?.displayName ?? asset;

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Borrowed $${amount.toFixed(2)} ${displayName}`);
        printKeyValue('Health Factor', result.healthFactor.toFixed(2));
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
