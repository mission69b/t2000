// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// `t2 mcp install` — write the t2000 MCP server entry into every
// supported AI client's JSON config file (Claude Desktop / Cursor /
// Windsurf). Idempotent — re-running reports "already configured".

import type { Command } from 'commander';
import {
  getPlatformConfigs,
  hasMcpEntry,
  readJsonFile,
  withMcpEntry,
  writeJsonFile,
} from './platforms.js';
import {
  printSuccess,
  printBlank,
  printInfo,
  printJson,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface McpInstallResult {
  name: string;
  slug: string;
  status: 'added' | 'exists';
}

export async function runInstall(): Promise<McpInstallResult[]> {
  const platforms = getPlatformConfigs();
  const results: McpInstallResult[] = [];
  for (const platform of platforms) {
    const config = await readJsonFile(platform.path);
    if (hasMcpEntry(config)) {
      results.push({ name: platform.name, slug: platform.slug, status: 'exists' });
      continue;
    }
    await writeJsonFile(platform.path, withMcpEntry(config));
    results.push({ name: platform.name, slug: platform.slug, status: 'added' });
  }
  return results;
}

export function registerMcpInstall(parent: Command) {
  parent
    .command('install')
    .description('Auto-configure the MCP server in Claude Desktop, Cursor, and Windsurf')
    .action(async () => {
      try {
        const results = await runInstall();

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
}
