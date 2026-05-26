// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 mcp start` — boot the bundled `@t2000/mcp` stdio server. This is
// the default subcommand for `t2 mcp` so a bare `t2 mcp` (no
// subcommand) still starts the server in scripts that pipe stdio.

import type { Command } from 'commander';

export function registerMcpStart(parent: Command) {
  parent
    .command('start', { isDefault: true })
    .description('Start MCP server (stdio transport — for AI client integration)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: { key?: string }) => {
      let mod: { startMcpServer: (opts?: { keyPath?: string }) => Promise<void> };
      try {
        mod = await import('@t2000/mcp' as string);
      } catch {
        console.error('MCP server not installed. Run:\n  npm install -g @t2000/mcp');
        process.exit(1);
      }
      await mod.startMcpServer({ keyPath: opts.key });
    });
}
