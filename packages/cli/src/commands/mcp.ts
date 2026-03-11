import type { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { printSuccess, printBlank, printInfo, printJson, isJsonMode, handleError } from '../output.js';

const MCP_CONFIG = {
  command: 't2000',
  args: ['mcp'],
};

interface McpConfigFile {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function getPlatformConfigs(): { name: string; path: string }[] {
  const home = homedir();
  return [
    {
      name: 'Claude Desktop',
      path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    },
    {
      name: 'Cursor (global)',
      path: join(home, '.cursor', 'mcp.json'),
    },
  ];
}

async function readJsonFile(path: string): Promise<McpConfigFile> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeJsonFile(path: string, data: McpConfigFile): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function registerMcp(program: Command) {
  const mcp = program
    .command('mcp')
    .description('MCP server for AI platforms');

  mcp
    .command('start', { isDefault: true })
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

  mcp
    .command('install')
    .description('Auto-configure MCP in Claude Desktop and Cursor')
    .action(async () => {
      try {
        const platforms = getPlatformConfigs();
        const results: { name: string; status: 'added' | 'exists' }[] = [];

        for (const platform of platforms) {
          const config = await readJsonFile(platform.path);

          if (config.mcpServers && (config.mcpServers as Record<string, unknown>)['t2000']) {
            results.push({ name: platform.name, status: 'exists' });
            continue;
          }

          config.mcpServers = {
            ...(config.mcpServers ?? {}),
            t2000: MCP_CONFIG,
          };

          await writeJsonFile(platform.path, config);
          results.push({ name: platform.name, status: 'added' });
        }

        if (isJsonMode()) {
          printJson({ installed: results });
          return;
        }

        printBlank();
        for (const r of results) {
          if (r.status === 'exists') {
            printInfo(`${r.name}  already configured`);
          } else {
            printSuccess(`${r.name}  configured`);
          }
        }
        printBlank();
        printInfo('Restart your AI platform to activate.');
        printInfo('Then ask: "what\'s my t2000 balance?"');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  mcp
    .command('uninstall')
    .description('Remove t2000 MCP config from Claude Desktop and Cursor')
    .action(async () => {
      try {
        const platforms = getPlatformConfigs();
        const results: { name: string; removed: boolean }[] = [];

        for (const platform of platforms) {
          if (!existsSync(platform.path)) {
            results.push({ name: platform.name, removed: false });
            continue;
          }

          const config = await readJsonFile(platform.path);

          if (!config.mcpServers || !(config.mcpServers as Record<string, unknown>)['t2000']) {
            results.push({ name: platform.name, removed: false });
            continue;
          }

          delete (config.mcpServers as Record<string, unknown>)['t2000'];
          await writeJsonFile(platform.path, config);
          results.push({ name: platform.name, removed: true });
        }

        if (isJsonMode()) {
          printJson({ uninstalled: results });
          return;
        }

        printBlank();
        for (const r of results) {
          if (r.removed) {
            printSuccess(`${r.name}  removed`);
          } else {
            printInfo(`${r.name}  not configured (skipped)`);
          }
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
