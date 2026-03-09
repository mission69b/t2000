import type { Command } from 'commander';
import { T2000, normalizeAsset, SUPPORTED_ASSETS } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerRepay(program: Command) {
  program
    .command('repay')
    .description('Repay borrowed stablecoins')
    .argument('<amount>', 'Amount to repay (or "all")')
    .argument('[asset]', 'Asset to repay (USDC, USDT, USDe, USDsui)', 'USDC')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .action(async (amountStr, assetStr, opts) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const asset = assetStr ?? 'USDC';
        const result = await agent.repay({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        const normalized = normalizeAsset(asset);
        const displayName = SUPPORTED_ASSETS[normalized as keyof typeof SUPPORTED_ASSETS]?.displayName ?? asset;

        printBlank();
        printSuccess(`Repaid $${result.amount.toFixed(2)} ${displayName}`);
        printKeyValue('Remaining Debt', `$${result.remainingDebt.toFixed(2)}`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
