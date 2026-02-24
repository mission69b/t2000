import { Command } from 'commander';
import { setJsonMode } from './output.js';
import { registerInit } from './commands/init.js';
import { registerSend } from './commands/send.js';
import { registerBalance } from './commands/balance.js';
import { registerAddress } from './commands/address.js';
import { registerDeposit } from './commands/deposit.js';
import { registerHistory } from './commands/history.js';
import { registerExport } from './commands/exportKey.js';
import { registerImport } from './commands/importKey.js';
import { registerSave } from './commands/save.js';
import { registerWithdraw } from './commands/withdraw.js';
import { registerBorrow } from './commands/borrow.js';
import { registerRepay } from './commands/repay.js';
import { registerHealth } from './commands/health.js';
import { registerRates } from './commands/rates.js';
import { registerPositions } from './commands/positions.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('t2000')
    .description('The first wallet for AI agents')
    .version('0.1.0')
    .option('--json', 'Output in JSON format')
    .option('--yes', 'Skip confirmation prompts')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();
      if (opts.json) setJsonMode(true);
    });

  registerInit(program);
  registerSend(program);
  registerBalance(program);
  registerAddress(program);
  registerDeposit(program);
  registerHistory(program);
  registerExport(program);
  registerImport(program);
  registerSave(program);
  registerWithdraw(program);
  registerBorrow(program);
  registerRepay(program);
  registerHealth(program);
  registerRates(program);
  registerPositions(program);

  return program;
}
