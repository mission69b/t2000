// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// Greenfield program.ts — registers the new Agent Wallet command tree.
// Old DeFi commands (save/withdraw/borrow/repay/etc) are still
// registered for back-compat; they get removed in Day 3-5 of Phase A
// as new replacements land. The intent is to NOT break `t2000 save 10`
// mid-pivot — old paths keep working until cut intentionally.

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setJsonMode } from './output.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };

// v4 greenfield (new) — Day 1 deliverables
import { registerInit } from './commands/init.js';
import { registerExport } from './commands/export.js';
import { registerReceive } from './commands/receive.js';
import { registerBalance } from './commands/balance.js';
import { registerWallet } from './commands/wallet/index.js';

// v3 legacy (kept for back-compat through Phase A — deleted by Day 5/6)
import { registerSend } from './commands/send.js';
import { registerHistory } from './commands/history.js';
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
import { registerEarn } from './commands/earn.js';
import { registerMcp } from './commands/mcp.js';
import { registerContacts } from './commands/contacts.js';
import { registerClaimRewards } from './commands/claimRewards.js';
import { registerSwap } from './commands/swap.js';
import { registerSwapQuote } from './commands/swapQuote.js';
import { registerSkills } from './commands/skills.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('t2')
    .description('Agent Wallet — autonomous Sui USDC + USDsui wallet for AI agents')
    .version(`${CLI_VERSION}`)
    .option('--json', 'Output in JSON format')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();
      if (opts.json) setJsonMode(true);
    })
    .addHelpText('after', `
Examples:
  $ t2 init                            Create a new Agent Wallet (no PIN)
  $ t2 init --import                   Import a v3.x wallet (interactive)
  $ t2 receive                         Show address + QR for incoming transfers
  $ t2 balance                         Show stablecoin + SUI holdings
  $ t2 wallet address                  Print address (machine-parseable)
  $ t2 send 5 USDC alice.sui           Send 5 USDC (gasless; --asset required)
  $ t2 swap 100 USDC SUI               Swap 100 USDC for SUI via Cetus
  $ t2 pay <mpp_url>                   Pay an MPP / x402 service
  $ t2 mcp install                     Connect Claude / Cursor / Codex / Windsurf
  $ t2 skills install                  Install skills as local SKILL.md files`);

  // === v4 Agent Wallet command tree ===
  registerInit(program);
  registerExport(program);
  registerReceive(program);
  registerBalance(program);
  registerWallet(program);

  // === v3 back-compat (gets pruned in Day 3-5 of Phase A) ===
  registerSend(program);
  registerHistory(program);
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
  registerEarn(program);
  registerMcp(program);
  registerContacts(program);
  registerClaimRewards(program);
  registerSwap(program);
  registerSwapQuote(program);
  registerSkills(program);

  return program;
}
