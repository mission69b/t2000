// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1+3+4 — 2026-05-26]
// Greenfield program.ts — registers the new Agent Wallet command tree.
// Old DeFi commands (save/withdraw/borrow/repay/etc) are still
// registered for back-compat; they get removed in Day 5 of Phase A
// as new replacements land. The intent is to NOT break `t2000 save 10`
// mid-pivot — old paths keep working until cut intentionally.
//
// Day 3 (2026-05-26): rewrote `send` + `swap` + `pay` in-place for the
// v4 surface (asset required on send, swap folds swap-quote into
// `--quote`, pay adds `--estimate`). Dropped the legacy `swap-quote`
// registration — the file itself stays until Day 5's bulk delete pass.
//
// Day 4 (2026-05-26): added `services/` + `limit/` groups. The
// `limit/` group plugs into the Day 3 send/swap/pay commands as
// opt-in spending caps with --force override. `services/` queries
// the mpp.t2000.ai catalog for discovery + inspection.

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

// v4 greenfield — Day 4 deliverables (services + limit groups)
import { registerServices } from './commands/services/index.js';
import { registerLimit } from './commands/limit/index.js';

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
// Day 3: `swap-quote` folded into `t2 swap --quote`. File stays until
// Day 5's bulk delete pass.
// import { registerSwapQuote } from './commands/swapQuote.js';
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
  $ t2 services search "image"         Discover MPP services in the gateway catalog
  $ t2 limit set --daily 100           Opt in to a $100 daily-send spending cap
  $ t2 mcp install                     Connect Claude / Cursor / Codex / Windsurf
  $ t2 skills install                  Install skills as local SKILL.md files`);

  // === v4 Agent Wallet command tree ===
  registerInit(program);
  registerExport(program);
  registerReceive(program);
  registerBalance(program);
  registerWallet(program);
  registerServices(program);
  registerLimit(program);

  // === v3 back-compat (gets pruned in Day 5 of Phase A) ===
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
  // Day 3: `swap-quote` folded into `t2 swap --quote`.
  registerSkills(program);

  return program;
}
