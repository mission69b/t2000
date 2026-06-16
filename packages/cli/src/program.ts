import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setJsonMode } from './output.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };

import { registerInit } from './commands/init.js';
import { registerExport } from './commands/export.js';
import { registerFund } from './commands/receive.js';
import { registerBalance } from './commands/balance.js';
import { registerHistory } from './commands/history.js';
import { registerStatus } from './commands/status.js';

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
  $ t2 init                            Create a new Agent Wallet
  $ t2 init --import                   Import an existing Bech32 secret (interactive)
  $ t2 fund                            Show address + QR to fund the wallet
  $ t2 status                          Health check: wallet, balances, limits, MCP, gateway
  $ t2 balance                         Show USDC / USDsui / SUI holdings
  $ t2 send 5 USDC alice.sui           Send 5 USDC (gasless; asset required)
  $ t2 swap 100 USDC SUI               Swap 100 USDC for SUI via Cetus
  $ t2 pay <url> --estimate            Preview an x402 service's price + input schema (no payment)
  $ t2 services search "image"         Discover x402 services in the gateway catalog
  $ t2 limit set --daily 100           Change the daily spend cap (default $100/day)
  $ t2 mcp install                     Connect Claude / Cursor / Windsurf
  $ t2 skills install                  Install skills as local SKILL.md files`);

  registerInit(program);
  registerExport(program);
  registerFund(program);
  registerBalance(program);
  registerHistory(program);
  registerStatus(program);

  registerSend(program);
  registerSwap(program);
  registerPay(program);
  registerServices(program);
  registerLimit(program);
  registerMcp(program);
  registerSkills(program);

  return program;
}
