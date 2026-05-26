// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// Shared MCP platform descriptors + low-level JSON config helpers.
// Used by `t2 mcp install` + `t2 mcp uninstall`. Kept separate from the
// command files so unit tests can exercise the data layer without
// spinning up commander.
//
// Codex coverage NOTE: `~/.codex/config.json` doesn't exist in this
// helper today — adding it is gated on confirming Codex's settled
// MCP config path. The plan calls for full Codex coverage in Phase B
// when the skills + MCP install instructions get unified. For Day 5
// we ship parity with the legacy `mcp.ts` (Claude / Cursor / Windsurf)
// and follow up in Phase B.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

export interface McpPlatform {
  /** Human-readable label rendered in CLI output. */
  name: string;
  /** Slug used in JSON envelopes + future `--client` flag matching. */
  slug: 'claude-desktop' | 'cursor' | 'windsurf';
  /** Absolute path to the platform's JSON config file. */
  path: string;
}

/**
 * The MCP server entry that gets written into each platform's
 * `mcpServers.<key>` map. Uses `t2` (the new canonical binary) — the
 * legacy `t2000` alias still resolves to the same binary post-Phase C,
 * but new installs record the modern name.
 */
export const MCP_SERVER_ENTRY = {
  command: 't2',
  args: ['mcp', 'start'],
} as const;

/**
 * Key under `mcpServers` in each platform's config. Stays `t2000` so
 * existing installs continue to resolve — switching the key would
 * orphan every legacy install on uninstall.
 */
export const MCP_SERVER_KEY = 't2000';

export interface McpConfigFile {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Build the list of platform configs the install/uninstall commands
 * walk through. Computed lazily so tests can stub `homedir()` via
 * `HOME` env override.
 */
export function getPlatformConfigs(): McpPlatform[] {
  const home = homedir();
  return [
    {
      name: 'Claude Desktop',
      slug: 'claude-desktop',
      path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    },
    {
      name: 'Cursor',
      slug: 'cursor',
      path: join(home, '.cursor', 'mcp.json'),
    },
    {
      name: 'Windsurf',
      slug: 'windsurf',
      path: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    },
  ];
}

export async function readJsonFile(path: string): Promise<McpConfigFile> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as McpConfigFile;
  } catch {
    return {};
  }
}

export async function writeJsonFile(path: string, data: McpConfigFile): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Pure mutator: returns the new config object with the t2000 MCP
 * entry merged in. Idempotent — calling twice produces the same
 * result. Caller decides whether to write it back to disk.
 */
export function withMcpEntry(config: McpConfigFile): McpConfigFile {
  return {
    ...config,
    mcpServers: {
      ...(config.mcpServers ?? {}),
      [MCP_SERVER_KEY]: { ...MCP_SERVER_ENTRY },
    },
  };
}

export function hasMcpEntry(config: McpConfigFile): boolean {
  return (
    typeof config.mcpServers === 'object' &&
    config.mcpServers !== null &&
    MCP_SERVER_KEY in (config.mcpServers as Record<string, unknown>)
  );
}

/**
 * Pure mutator: returns the config without the t2000 MCP entry. If
 * the entry isn't present, returns the input unchanged.
 */
export function withoutMcpEntry(config: McpConfigFile): McpConfigFile {
  if (!hasMcpEntry(config)) return config;
  const servers = { ...(config.mcpServers as Record<string, unknown>) };
  delete servers[MCP_SERVER_KEY];
  return { ...config, mcpServers: servers };
}
