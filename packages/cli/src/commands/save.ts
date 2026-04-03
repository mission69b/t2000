import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerSave(program: Command) {
  const action = async (amountStr: string, opts: { key?: string; protocol?: string; asset?: string }) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const asset = (opts.asset?.toUpperCase() ?? 'USDC') as 'USDC' | 'USDT' | 'SUI' | 'USDe' | 'USDsui';

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        let gasManagerUsdc = 0;
        agent.on('gasAutoTopUp', (data) => {
          gasManagerUsdc = data.usdcSpent;
        });

        const result = await agent.save({ amount, asset, protocol: opts.protocol });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();

        if (gasManagerUsdc > 0) {
          printSuccess(`Gas manager: ${pc.yellow(formatUsd(gasManagerUsdc))} USDC → SUI`);
        }

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
    .description('Deposit into NAVI lending to earn yield (USDC, USDT, SUI, USDe, USDsui)')
    .argument('<amount>', 'Amount to save (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <token>', 'Asset to deposit (default: USDC)')
    .action(action);

  program
    .command('supply')
    .description('Deposit into NAVI lending (alias for save)')
    .argument('<amount>', 'Amount to save (or "all")')
    .option('--key <path>', 'Key file path')
    .option('--protocol <name>', 'Protocol to use (e.g. navi)')
    .option('--asset <token>', 'Asset to deposit (default: USDC)')
    .action(action);
}
