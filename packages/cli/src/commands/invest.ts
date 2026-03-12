import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import type { InvestmentAsset } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerInvest(program: Command) {
  const investCmd = program
    .command('invest')
    .description('Buy or sell investment assets');

  investCmd
    .command('buy <amount> <asset>')
    .description('Invest USD amount in an asset')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percent', '3')
    .action(async (amount: string, asset: string, opts: { key?: string; slippage: string }) => {
      try {
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed <= 0 || !isFinite(parsed)) {
          console.error(pc.red('  ✗ Amount must be greater than $0'));
          process.exitCode = 1;
          return;
        }
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const result = await agent.investBuy({
          asset: asset.toUpperCase() as InvestmentAsset,
          usdAmount: parsed,
          maxSlippage: parseFloat(opts.slippage) / 100,
        });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        printSuccess(`Bought ${result.amount.toFixed(4)} ${asset.toUpperCase()} at ${formatUsd(result.price)}`);
        printKeyValue('Invested', formatUsd(result.usdValue));
        printKeyValue('Portfolio', `${result.position.totalAmount.toFixed(4)} ${asset.toUpperCase()} (avg ${formatUsd(result.position.avgPrice)})`);
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) { handleError(error); }
    });

  investCmd
    .command('sell <amount> <asset>')
    .description('Sell USD amount of an asset (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percent', '3')
    .action(async (amount: string, asset: string, opts: { key?: string; slippage: string }) => {
      try {
        const isAll = amount.toLowerCase() === 'all';
        if (!isAll) {
          const parsed = parseFloat(amount);
          if (isNaN(parsed) || parsed <= 0 || !isFinite(parsed)) {
            console.error(pc.red('  ✗ Amount must be greater than $0'));
            process.exitCode = 1;
            return;
          }
        }
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });
        const usdAmount = isAll ? 'all' as const : parseFloat(amount);
        const result = await agent.investSell({
          asset: asset.toUpperCase() as InvestmentAsset,
          usdAmount,
          maxSlippage: parseFloat(opts.slippage) / 100,
        });

        if (isJsonMode()) { printJson(result); return; }

        printBlank();
        printSuccess(`Sold ${result.amount.toFixed(4)} ${asset.toUpperCase()} at ${formatUsd(result.price)}`);
        printKeyValue('Proceeds', formatUsd(result.usdValue));
        if (result.realizedPnL !== undefined) {
          const pnlColor = result.realizedPnL >= 0 ? pc.green : pc.red;
          const pnlSign = result.realizedPnL >= 0 ? '+' : '';
          printKeyValue('Realized P&L', pnlColor(`${pnlSign}${formatUsd(result.realizedPnL)}`));
        }
        if (result.position.totalAmount > 0) {
          printKeyValue('Remaining', `${result.position.totalAmount.toFixed(4)} ${asset.toUpperCase()} (avg ${formatUsd(result.position.avgPrice)})`);
        }
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) { handleError(error); }
    });
}
