// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1+3+4+5 — 2026-05-26]
// Greenfield program.ts — registers the v4 Agent Wallet command tree.
// All legacy DeFi / banking / PIN commands were deleted on Day 5;
// what remains is the 9-group Circle-style surface locked by the SPEC:
//   wallet · send · swap · pay · services · limit · mcp · skills
//   + singletons (init / export / receive / balance + history).
//
// History track:
//   Day 1: scaffold + wallet group + helpers (init/export/receive/balance).
//   Day 3: rewrote send + swap + pay in-place for the v4 surface.
//   Day 4: added services + limit groups + opt-in spending caps.
//   Day 5: refactored mcp.ts + skills.ts into folder groups;
//          migrated history.ts to withAgent; bulk-deleted the legacy
//          DeFi/banking/PIN commands per SPEC line 117.

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setJsonMode } from './output.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };

// v4 greenfield singletons
import { registerInit } from './commands/init.js';
import { registerExport } from './commands/export.js';
import { registerReceive } from './commands/receive.js';
import { registerBalance } from './commands/balance.js';
import { registerHistory } from './commands/history.js';

// v4 greenfield command groups
import { registerWallet } from './commands/wallet/index.js';
import { registerSend } from './commands/send.js';
import { registerSwap } from './commands/swap.js';
import { registerPay } from './commands/pay.js';
import { registerServices } from './commands/services/index.js';
import { registerLimit } from './commands/limit/index.js';
import { registerMcp } from './commands/mcp/index.js';
import { registerSkills } from './commands/skills/index.js';

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
  $ t2 receive                         Show address + QR for incoming transfers
  $ t2 balance                         Show stablecoin + SUI holdings
  $ t2 wallet address                  Print address (machine-parseable)
  $ t2 send 5 USDC alice.sui           Send 5 USDC (gasless; asset required)
  $ t2 swap 100 USDC SUI               Swap 100 USDC for SUI via Cetus
  $ t2 pay <mpp_url>                   Pay an MPP / x402 service
  $ t2 services search "image"         Discover MPP services in the gateway catalog
  $ t2 limit set --daily 100           Opt in to a $100 daily-send spending cap
  $ t2 mcp install                     Connect Claude / Cursor / Windsurf
  $ t2 skills install                  Install skills as local SKILL.md files`);

  // Singletons
  registerInit(program);
  registerExport(program);
  registerReceive(program);
  registerBalance(program);
  registerHistory(program);

  // Command groups
  registerWallet(program);
  registerSend(program);
  registerSwap(program);
  registerPay(program);
  registerServices(program);
  registerLimit(program);
  registerMcp(program);
  registerSkills(program);

  return program;
}
