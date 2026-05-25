import { tool } from 'ai';
import { z } from 'zod';
// [SPEC AI SDK HARDENING P4.1 Batch 4 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import type { ToolContext, ToolResult } from '../types.js';

interface YieldSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  currentApy: number;
  deposited: number;
  projectedYear: number;
  sparkline: number[];
}

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const yieldSummaryDescription =
  'Returns yield earnings breakdown: today, this week, this month, all-time, current APY, deposited amount, projected yearly earnings, and a monthly sparkline. Use when the user asks about yield, earnings, or how much they have earned.';

const yieldSummaryInputSchema = z.object({});

type YieldSummaryInput = z.infer<typeof yieldSummaryInputSchema>;

async function yieldSummaryCallBody(
  _input: YieldSummaryInput,
  context: ToolContext,
): Promise<ToolResult<YieldSummary>> {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const address = context.walletAddress;

    const empty: YieldSummary = {
      today: 0, thisWeek: 0, thisMonth: 0, allTime: 0,
      currentApy: 0, deposited: 0, projectedYear: 0, sparkline: [],
    };

    if (!apiUrl || !address) {
      return { data: empty, displayText: 'Yield summary not available.' };
    }

    try {
      const internalKey = context.env?.AUDRIC_INTERNAL_KEY;
      // [Day 20d / 2026-05-17] See activity-summary.ts — the analytics
      // routes use `authenticateAnalyticsRequest()` which accepts
      // `x-internal-key` for server-side callers (engine) AND `x-zklogin-jwt`
      // for browser callers. Engine path → internal key.
      const res = await fetch(
        `${apiUrl}/api/analytics/yield-summary?address=${address}`,
        {
          headers: {
            'x-sui-address': address,
            ...(internalKey ? { 'x-internal-key': internalKey } : {}),
          },
          signal: context.signal,
        },
      );

      if (!res.ok) {
        return { data: empty, displayText: `Could not fetch yield data (HTTP ${res.status}).` };
      }

      const data = (await res.json()) as YieldSummary;
      const apy = data.currentApy ?? 0;
      const apyPct = apy < 1 ? (apy * 100).toFixed(2) : apy.toFixed(2);

      return {
        data,
        displayText: data.allTime > 0
          ? `You've earned $${data.allTime.toFixed(2)} all-time ($${data.today.toFixed(4)} today). Current APY: ${apyPct}%. Deposited: $${data.deposited.toFixed(2)}. Projected: $${data.projectedYear.toFixed(2)}/year.`
          : `No yield earnings yet. Deposit USDC to start earning ${apyPct}% APY.`,
      };
    } catch {
      return { data: empty, displayText: 'Error fetching yield summary.' };
    }
}

export const yieldSummaryTool = tool({
  description: yieldSummaryDescription,
  inputSchema: yieldSummaryInputSchema,
  needsApproval: buildNeedsApproval('yield_summary'),
  execute: wrapEngineExecute<YieldSummaryInput, YieldSummary>(
    'yield_summary',
    { call: yieldSummaryCallBody },
  ),
});
