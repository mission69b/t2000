import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setJsonMode } from './output.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };
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
import { registerEarnings } from './commands/earnings.js';
import { registerFundStatus } from './commands/fundStatus.js';
import { registerConfig } from './commands/config.js';
import { registerServe } from './commands/serve.js';
import { registerPay } from './commands/pay.js';
import { registerLock } from './commands/lock.js';
import { registerSentinel } from './commands/sentinel.js';
import { registerEarn } from './commands/earn.js';
import { registerRebalance } from './commands/rebalance.js';
import { registerExchange } from './commands/exchange.js';
import { registerMcp } from './commands/mcp.js';
import { registerContacts } from './commands/contacts.js';
import { registerInvest } from './commands/invest.js';
import { registerPortfolio } from './commands/portfolio.js';
import { registerClaimRewards } from './commands/claimRewards.js';
export function createProgram(): Command {
  const program = new Command();

  program
    .name('t2000')
    .description('A bank account for AI agents')
    .version(`${CLI_VERSION} (beta)`)
    .option('--json', 'Output in JSON format')
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
  registerEarnings(program);
  registerFundStatus(program);
  registerConfig(program);
  registerServe(program);
  registerPay(program);
  registerLock(program);
  registerSentinel(program);
  registerEarn(program);
  registerRebalance(program);
  registerExchange(program);
  registerMcp(program);
  registerContacts(program);
  registerInvest(program);
  registerPortfolio(program);
  registerClaimRewards(program);

  return program;
}
