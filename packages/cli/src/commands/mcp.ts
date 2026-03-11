import type { Command } from 'commander';

export function registerMcp(program: Command) {
  program
    .command('mcp')
    .description('Start MCP server (stdio transport)')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      let mod: { startMcpServer: (opts?: { keyPath?: string }) => Promise<void> };
      try {
        mod = await import('@t2000/mcp' as string);
      } catch {
        console.error(
          'MCP server not installed. Run:\n  npm install -g @t2000/mcp',
        );
        process.exit(1);
      }
      await mod.startMcpServer({ keyPath: opts.key });
    });
}
