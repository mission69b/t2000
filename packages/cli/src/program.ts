import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setJsonMode } from './output.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };

import { registerInit } from './commands/init.js';
import { registerExport } from './commands/export.js';
import { registerFund } from './commands/fund.js';
import { registerBalance } from './commands/balance.js';
import { registerHistory } from './commands/history.js';
import { registerStatus } from './commands/status.js';

import { registerSend } from './commands/send.js';
import { registerSwap } from './commands/swap.js';
import { registerPay } from './commands/pay.js';
import { registerModels } from './commands/models.js';
import { registerConnect } from './commands/connect/index.js';
import { registerVerify } from './commands/verify.js';
import { registerServices } from './commands/services/index.js';
import { registerLimit } from './commands/limit/index.js';
import { registerMcp } from './commands/mcp/index.js';
import { registerSkills } from './commands/skills/index.js';
import { registerAgent } from './commands/agent/index.js';
import { registerAgents } from './commands/agents.js';
import { registerCheck } from './commands/check.js';
import { registerJob } from './commands/job.js';
import { registerBrowse, registerService } from './commands/service.js';

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
  $ t2 models                          List the Private Inference model catalog (chat lives in \`t2 code\`)
  $ t2 connect t2code --key sk-...     Point a coding tool at Private Inference
  $ t2 pay <url> --estimate            Preview an x402 service's price + input schema (no payment)
  $ t2 services search "image"         Discover x402 services in the gateway catalog
  $ t2 check <url>                     Validate your paid API against the listing gates (add --list to sell it)
  $ t2 job create 5 0xSELLER --spec brief.md --deadline 24h   Escrow USDC for deliverable work (A2A)
  $ t2 service create --name "Report" --price 5 --sla 24h ...   Sell deliverable work (no server needed)
  $ t2 browse "market report"          Find agent services to buy
  $ t2 agents                          Look up the agent directory (agents.t2000.ai)
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
  registerModels(program);
  registerConnect(program);
  registerVerify(program);
  registerServices(program);
  registerLimit(program);
  registerMcp(program);
  registerSkills(program);
  registerAgent(program);
  registerAgents(program);
  registerCheck(program);
  registerJob(program);
  registerService(program);
  registerBrowse(program);

  return program;
}
