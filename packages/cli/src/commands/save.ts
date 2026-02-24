import type { Command } from 'commander';
import { T2000 } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv, askConfirm } from '../prompts.js';
import { printSuccess, printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerSave(program: Command) {
  const action = async (amountStr: string, opts: { key?: string }) => {
      try {
        const amount: number | 'all' = amountStr === 'all' ? 'all' : parseFloat(amountStr);
        if (amount !== 'all' && (isNaN(amount) || amount <= 0)) {
          throw new Error('Amount must be a positive number or "all"');
        }

        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });

        const globalOpts = program.optsWithGlobals();
        if (!globalOpts.yes) {
          const label = amount === 'all' ? 'all available USDC' : `$${amount.toFixed(2)} USDC`;
          const ok = await askConfirm(`Save ${label} to earn yield?`);
          if (!ok) return;
        }

        const result = await agent.save({ amount });

        if (isJsonMode()) {
          printJson(result);
          return;
        }

        printBlank();
        printSuccess(`Saved $${result.amount.toFixed(2)} USDC`);
        printKeyValue('APY', `${result.apy.toFixed(2)}%`);
        printKeyValue('Tx', result.tx);
        printKeyValue('Gas', `${result.gasCost.toFixed(6)} SUI (${result.gasMethod})`);
        printBlank();
    } catch (error) {
      handleError(error);
    }
  };

  program
    .command('save')
    .description('Deposit USDC into savings (Suilend)')
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
