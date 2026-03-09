import type { Command } from 'commander';
import { T2000, SUPPORTED_ASSETS } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, printWarning, explorerUrl } from '../output.js';

export function registerWithdraw(program: Command) {
  program
    .command('withdraw')
    .description('Withdraw stablecoins from savings')
    .argument('<amount>', 'Amount to withdraw (or "all")')
    .argument('[asset]', 'Asset to withdraw (USDC, USDT, USDe, USDsui)', 'USDC')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi, suilend)')
    .action(async (amountStr, assetStr, opts) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const asset = assetStr ?? 'USDC';
        const result = await agent.withdraw({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        const displayName = SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? asset;
        printBlank();
        printSuccess(`Withdrew $${result.amount.toFixed(2)} ${displayName}`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
