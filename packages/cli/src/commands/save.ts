import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

type SaveAsset = 'USDC' | 'USDsui';
const SAVE_ASSETS: readonly SaveAsset[] = ['USDC', 'USDsui'] as const;

function resolveSaveAsset(input: string | undefined): SaveAsset {
  if (!input) return 'USDC';
  const match = SAVE_ASSETS.find((a) => a.toLowerCase() === input.toLowerCase());
  if (!match) {
    throw new Error(`--asset must be one of: ${SAVE_ASSETS.join(', ')}. Got: "${input}"`);
  }
  return match;
}

export function registerSave(program: Command) {
  const action = async (amountStr: string, opts: { key?: string; protocol?: string; asset?: string }) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const asset = resolveSaveAsset(opts.asset);

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const result = await agent.save({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();

        const protocolName = opts.protocol ?? 'best rate';
        printSuccess(`Saved ${pc.yellow(formatUsd(result.amount))} ${asset} to ${protocolName}`);

        if (result.fee > 0) {
          const feeRate = (result.fee / result.amount * 100).toFixed(1);
          printSuccess(`Protocol fee: ${pc.dim(`${formatUsd(result.fee)} ${asset} (${feeRate}%)`)}`);
        }

        printSuccess(`Current APY: ${pc.green(`${result.apy.toFixed(2)}%`)}`);

        printSuccess(`Savings balance: ${pc.yellow(formatUsd(result.savingsBalance))} ${asset}`);

        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
    } catch (error) {
      handleError(error);
    }
  };

  program
    .command('save')
    .description('Deposit USDC or USDsui into NAVI lending to earn yield')
    .argument('<amount>', 'Amount of the chosen asset to save (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <symbol>', 'Asset to save: USDC (default) or USDsui')
    .action(action);

  program
    .command('supply')
    .description('Deposit USDC or USDsui into NAVI lending (alias for save)')
    .argument('<amount>', 'Amount of the chosen asset to save (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <symbol>', 'Asset to save: USDC (default) or USDsui')
    .action(action);
}
