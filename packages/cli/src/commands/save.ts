import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, formatUsd } from '@t2000/sdk';
import { resolvePin, askConfirm } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError, explorerUrl } from '../output.js';

export function registerSave(program: Command) {
  const action = async (amountStr: string, opts: { key?: string }) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const globalOpts = program.optsWithGlobals();
        if (!globalOpts.yes) {
          const label = amount === 'all' ? 'all available USDC' : `$${(amount as number).toFixed(2)} USDC`;
          const ok = await askConfirm(`Save ${label} to earn yield?`);
          if (!ok) return;
        }

        let gasManagerUsdc = 0;
        agent.on('gasAutoTopUp', (data) => {
          gasManagerUsdc = data.usdcSpent;
        });

        const result = await agent.save({ amount });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();

        if (gasManagerUsdc > 0) {
          printSuccess(`Gas manager: ${pc.yellow(formatUsd(gasManagerUsdc))} USDC → SUI`);
        }

        printSuccess(`Saved ${pc.yellow(formatUsd(result.amount))} USDC to NAVI`);

        if (result.fee > 0) {
          const feeRate = (result.fee / result.amount * 100).toFixed(1);
          printSuccess(`Protocol fee: ${pc.dim(`${formatUsd(result.fee)} USDC (${feeRate}%)`)}`);
        }

        printSuccess(`Current APY: ${pc.green(`${result.apy.toFixed(2)}%`)}`);

        printSuccess(`Savings balance: ${pc.yellow(formatUsd(result.savingsBalance))} USDC`);

        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
    } catch (error) {
      handleError(error);
    }
  };

  program
    .command('save')
    .description('Deposit USDC into savings (NAVI Protocol)')
    .argument('<amount>', 'Amount in USDC to save (or "all")')
    .option('--key <path>', 'Key file path')
    .action(action);

  program
    .command('supply')
    .description('Deposit USDC into savings (alias for save)')
    .argument('<amount>', 'Amount in USDC to save (or "all")')
    .option('--key <path>', 'Key file path')
    .action(action);
}
