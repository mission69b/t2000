// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 mcp` command group. Replaces the pre-pivot single-file
// `commands/mcp.ts` (deleted) with a folder structure mirroring the
// rest of the v4 surface (services/, limit/, wallet/, skills/).

import type { Command } from 'commander';
import { registerMcpStart } from './start.js';
import { registerMcpInstall } from './install.js';
import { registerMcpUninstall } from './uninstall.js';

export function registerMcp(program: Command) {
  const group = program
    .command('mcp')
    .description('MCP server + AI-client integration')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 mcp                            Start the MCP stdio server (default)
  $ t2 mcp start                      Same as above (explicit)
  $ t2 mcp install                    Auto-configure Claude / Cursor / Windsurf
  $ t2 mcp uninstall                  Remove t2000 from every AI-client config
`,
    );

  registerMcpStart(group);
  registerMcpInstall(group);
  registerMcpUninstall(group);
}
