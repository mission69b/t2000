// `t2 mcp` — RETIRED (SPEC_T2_KILL_STDIO, 2026-08-02). The local stdio MCP
// server is gone; the one MCP distribution is the hosted Connect URL. This
// hidden stub exists so old muscle memory / scripts get the pointer instead of
// commander's unknown-command error, and so `t2 mcp uninstall` can still clean
// the stdio entry out of AI-client configs that `t2 mcp install` once wrote.

import type { Command } from 'commander';
import { printBlank, printInfo, printLine } from '../../output.js';
import { registerMcpUninstall } from './uninstall.js';

const CONNECT_SNIPPET = `{
  "mcpServers": {
    "t2000": {
      "url": "https://mcp.t2000.ai/mcp"
    }
  }
}`;

function printRetired(): void {
  printBlank();
  printInfo('The local stdio MCP server is retired.');
  printLine('');
  printLine('Connect any MCP client to the hosted server instead — one URL,');
  printLine('OAuth sign-in, spend limits you set in the console:');
  printLine('');
  for (const line of CONNECT_SNIPPET.split('\n')) {
    printLine(`  ${line}`);
  }
  printLine('');
  printLine('Docs: https://docs.t2000.ai/passport-connect');
  printLine('Terminal workflows: use the t2 CLI itself.');
  printLine('Old client configs: clean up with `t2 mcp uninstall`.');
  printBlank();
}

export function registerMcp(program: Command) {
  const group = program
    .command('mcp', { hidden: true })
    .description('Retired — connect clients to https://mcp.t2000.ai/mcp instead');

  group.action(() => {
    printRetired();
    process.exitCode = 1;
  });
  for (const retired of ['start', 'install']) {
    group
      .command(retired, { hidden: true })
      .description('Retired — connect clients to https://mcp.t2000.ai/mcp instead')
      .action(() => {
        printRetired();
        process.exitCode = 1;
      });
  }

  registerMcpUninstall(group);
}
