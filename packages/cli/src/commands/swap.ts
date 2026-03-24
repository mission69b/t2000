import type { Command } from 'commander';
import { T2000, formatUsd, SUPPORTED_ASSETS, INVESTMENT_ASSETS } from '@t2000/sdk';
import type { InvestmentAsset } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

function resolveAssetName(input: string): string {
  const upper = input.toUpperCase();
  for (const key of Object.keys(SUPPORTED_ASSETS)) {
    if (key.toUpperCase() === upper) return key;
  }
  return input;
}

function fmtTokenAmount(amount: number, asset: string): string {
  if (['USDC', 'USDT', 'USDE'].includes(asset)) return formatUsd(amount);
  if (amount > 0 && amount < 0.001) return amount.toFixed(8);
  if (amount > 0 && amount < 1) return amount.toFixed(6);
  return amount.toFixed(4);
}

async function executeSwap(
  from: string,
  to: string,
  amount: number,
  opts: { key?: string; slippage?: string },
  label: 'Swapped' | 'Bought' | 'Sold',
) {
  const pin = await resolvePin();
  const agent = await T2000.create({ pin, keyPath: opts.key });

  const fromAsset = resolveAssetName(from);
  const toAsset = resolveAssetName(to);

  const result = await agent.swap({
    from: fromAsset,
    to: toAsset,
    amount,
    maxSlippage: parseFloat(opts.slippage ?? '3') / 100,
  });

  if (isJsonMode()) {
    printJson(result);
    return;
  }

  const fromDisplay = SUPPORTED_ASSETS[fromAsset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? fromAsset;
  const toDisplay = SUPPORTED_ASSETS[toAsset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? toAsset;

  printBlank();
  if (label === 'Bought') {
    printSuccess(`Bought ${fmtTokenAmount(result.toAmount, toAsset)} ${toDisplay} for ${formatUsd(amount)}`);
  } else if (label === 'Sold') {
    printSuccess(`Sold ${fmtTokenAmount(amount, fromAsset)} ${fromDisplay} for ${formatUsd(result.toAmount)}`);
  } else {
    printSuccess(`Swapped ${fmtTokenAmount(amount, fromAsset)} ${fromDisplay} → ${fmtTokenAmount(result.toAmount, toAsset)} ${toDisplay}`);
  }
  printKeyValue('Tx', explorerUrl(result.tx));
  printKeyValue('Gas', `${result.gasCost.toFixed(4)} SUI (${result.gasMethod})`);
  printBlank();
}

export function registerSwap(program: Command) {
  program
    .command('swap <amount> <from> <to>')
    .description('Swap tokens (e.g. swap 100 USDC SUI)')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percentage (default: 3)', '3')
    .action(async (amount: string, from: string, to: string, opts: { key?: string; slippage?: string }) => {
      try {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error('Amount must be a positive number');
        }
        await executeSwap(from, to, parsedAmount, opts, 'Swapped');
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('buy <amount> <asset>')
    .description('Buy an asset with USDC (e.g. buy 100 BTC)')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percentage (default: 3)', '3')
    .action(async (amount: string, asset: string, opts: { key?: string; slippage?: string }) => {
      try {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error('Amount must be a positive number');
        }
        const resolved = resolveAssetName(asset);
        if (resolved in INVESTMENT_ASSETS) {
          const pin = await resolvePin();
          const agent = await T2000.create({ pin, keyPath: opts.key });
          const result = await agent.investBuy({
            asset: resolved as InvestmentAsset,
            usdAmount: parsedAmount,
            maxSlippage: parseFloat(opts.slippage ?? '3') / 100,
          });
          if (isJsonMode()) { printJson(result); return; }
          const display = SUPPORTED_ASSETS[resolved as keyof typeof SUPPORTED_ASSETS]?.displayName ?? resolved;
          printBlank();
          printSuccess(`Bought ${fmtTokenAmount(result.amount, resolved)} ${display} for ${formatUsd(parsedAmount)}`);
          printKeyValue('Tx', explorerUrl(result.tx));
          printBlank();
        } else {
          await executeSwap('USDC', asset, parsedAmount, opts, 'Bought');
        }
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('sell <amount> <asset>')
    .description('Sell an asset for USDC (e.g. sell 0.001 BTC, sell all SUI)')
    .option('--key <path>', 'Key file path')
    .option('--slippage <pct>', 'Max slippage percentage (default: 3)', '3')
    .action(async (amount: string, asset: string, opts: { key?: string; slippage?: string }) => {
      try {
        const resolved = resolveAssetName(asset);
        const isAll = amount.toLowerCase() === 'all';
        if (resolved in INVESTMENT_ASSETS) {
          const pin = await resolvePin();
          const agent = await T2000.create({ pin, keyPath: opts.key });
          const usdAmount = isAll ? 'all' as const : parseFloat(amount);
          if (usdAmount !== 'all' && (isNaN(usdAmount) || usdAmount <= 0)) {
            throw new Error('Amount must be a positive number or "all"');
          }
          const result = await agent.investSell({
            asset: resolved as InvestmentAsset,
            usdAmount,
            maxSlippage: parseFloat(opts.slippage ?? '3') / 100,
          });
          if (isJsonMode()) { printJson(result); return; }
          const display = SUPPORTED_ASSETS[resolved as keyof typeof SUPPORTED_ASSETS]?.displayName ?? resolved;
          printBlank();
          printSuccess(`Sold ${fmtTokenAmount(result.amount, resolved)} ${display} at ${formatUsd(result.price)}`);
          printKeyValue('Proceeds', formatUsd(result.usdValue));
          if (result.realizedPnL !== undefined) {
            const pnlSign = result.realizedPnL >= 0 ? '+' : '';
            printKeyValue('Realized P&L', `${pnlSign}${formatUsd(result.realizedPnL)}`);
          }
          printKeyValue('Tx', explorerUrl(result.tx));
          printBlank();
        } else {
          const parsedAmount = parseFloat(amount);
          if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new Error('Amount must be a positive number');
          }
          await executeSwap(asset, 'USDC', parsedAmount, opts, 'Sold');
        }
      } catch (error) {
        handleError(error);
      }
    });
}
