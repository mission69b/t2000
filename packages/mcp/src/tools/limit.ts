import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getLimits, dailySpentToday } from '@t2000/sdk';
import { errorResult } from '../errors.js';

// [v4.0 Phase B — 2026-05-26; R-0 F1 — 2026-06-15] `t2000_limit` (read-only)
// mirrors `t2 limit show` — the LLM can SEE the user's spending caps but
// cannot set/clear them via MCP (that flows through the CLI, where the user
// has terminal access). Reads through the SAME `@t2000/sdk/limits` gate the
// write path enforces (single source of truth).
//
// H5 CLOSED (R-0 F1): MCP writes ARE now gated — `agent.send/swap/pay` enforce
// the unified limit in the SDK, so this tool is no longer "informational only";
// it narrates the caps the writes actually obey, plus today's cumulative spend.

export interface LimitsView {
  configured: boolean;
  perTxUsd?: number;
  dailyUsd?: number;
  /** Cumulative USD spent so far today (UTC) — counts against `dailyUsd`. */
  spentTodayUsd: number;
}

export function readLimits(configDir?: string): LimitsView {
  const limits = getLimits(configDir);
  const perTxUsd = limits?.perTxUsd;
  const dailyUsd = limits?.dailyUsd;
  return {
    configured: perTxUsd !== undefined || dailyUsd !== undefined,
    perTxUsd,
    dailyUsd,
    spentTodayUsd: dailySpentToday(configDir),
  };
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
        const view = readLimits();
        return { content: [{ type: 'text', text: JSON.stringify(view) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
