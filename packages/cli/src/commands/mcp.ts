import type { Command } from 'commander';

export function registerMcp(program: Command) {
  program
    .command('mcp')
    .description('Start MCP server (stdio transport)')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      const { startMcpServer } = await import('@t2000/mcp');
      await startMcpServer({ keyPath: opts.key });
    });
}
