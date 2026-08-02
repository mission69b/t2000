// `t2 mcp uninstall` — remove the RETIRED stdio server entry from every
// supported AI client's JSON config file (the cleanup path for configs that
// `t2 mcp install` wrote before SPEC_T2_KILL_STDIO). Idempotent — platforms
// without a t2000 entry are reported as `skipped`.

import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import {
  getPlatformConfigs,
  hasMcpEntry,
  readJsonFile,
  withoutMcpEntry,
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

export interface McpUninstallResult {
  name: string;
  slug: string;
  removed: boolean;
}

export async function runUninstall(): Promise<McpUninstallResult[]> {
  const platforms = getPlatformConfigs();
  const results: McpUninstallResult[] = [];
  for (const platform of platforms) {
    if (!existsSync(platform.path)) {
      results.push({ name: platform.name, slug: platform.slug, removed: false });
      continue;
    }
    const config = await readJsonFile(platform.path);
    if (!hasMcpEntry(config)) {
      results.push({ name: platform.name, slug: platform.slug, removed: false });
      continue;
    }
    await writeJsonFile(platform.path, withoutMcpEntry(config));
    results.push({ name: platform.name, slug: platform.slug, removed: true });
  }
  return results;
}

export function registerMcpUninstall(parent: Command) {
  parent
    .command('uninstall')
    .description('Remove the retired stdio server entry from Claude Desktop, Cursor, and Windsurf configs')
    .action(async () => {
      try {
        const results = await runUninstall();

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
