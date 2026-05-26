import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { errorResult } from '../errors.js';

// [v4.0 Phase B — 2026-05-26] `t2000_limit` (read-only) mirrors
// `t2 limit show` — the LLM can SEE what spending caps the user
// has set in `~/.t2000/config.json`, but cannot set or clear them
// via MCP. Setting / clearing flows through the CLI (`t2 limit set`,
// `t2 limit reset`) where the user has terminal access.
//
// PHASE D NOTE — limit enforcement parity. The CLI's `t2 send/swap/pay`
// commands gate writes on these limits. MCP write tools currently do
// NOT (see tools/write.ts header). Closing the gap requires moving
// the enforce code into `@t2000/sdk/limits/` so both surfaces share
// one gate. Until then, this tool is informational — the LLM can read
// limits to narrate context to the user, but MCP writes proceed
// without gating.

export interface LimitsView {
  configured: boolean;
  perTxUsd?: number;
  dailySendUsd?: number;
  configPath: string;
}

function defaultConfigPath(): string {
  return resolve(homedir(), '.t2000', 'config.json');
}

export async function readLimits(configPath?: string): Promise<LimitsView> {
  const path = configPath ?? defaultConfigPath();
  try {
    const content = await readFile(path, 'utf-8');
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null) return { configured: false, configPath: path };
    const limits = (raw as Record<string, unknown>).limits;
    if (typeof limits !== 'object' || limits === null) return { configured: false, configPath: path };
    const l = limits as Record<string, unknown>;
    const perTxUsd = typeof l.perTxUsd === 'number' && l.perTxUsd > 0 ? l.perTxUsd : undefined;
    const dailySendUsd = typeof l.dailySendUsd === 'number' && l.dailySendUsd > 0 ? l.dailySendUsd : undefined;
    const configured = perTxUsd !== undefined || dailySendUsd !== undefined;
    return { configured, perTxUsd, dailySendUsd, configPath: path };
  } catch {
    return { configured: false, configPath: path };
  }
}

export function registerLimitTool(server: McpServer): void {
  server.tool(
    't2000_limit',
    `View the user's opt-in spending limits as set via the CLI (\`t2 limit set --per-tx <USD>\` and \`t2 limit set --daily <USD>\`). Reads ~/.t2000/config.json. Returns { configured: false } when no limits are set.

IMPORTANT: This tool is READ-ONLY. Setting or clearing limits must be done via the CLI (the user has terminal access; security boundary). To suggest a limit change, ask the user to run \`t2 limit set --per-tx 50\` or \`t2 limit reset\` in their terminal.

Use the returned values to inform the user about their own configured caps before writes — e.g., if they set a $50 per-tx cap, surface that context when they ask for a $200 send so they can decide whether to lower the amount or run \`t2 limit reset\` first.`,
    {},
    async () => {
      try {
        const view = await readLimits();
        return { content: [{ type: 'text', text: JSON.stringify(view) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
