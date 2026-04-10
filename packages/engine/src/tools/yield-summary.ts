import { z } from 'zod';
import { buildTool } from '../tool.js';
import type { ToolResult } from '../types.js';

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

export const yieldSummaryTool = buildTool({
  name: 'yield_summary',
  description:
    'Returns yield earnings breakdown: today, this week, this month, all-time, current APY, deposited amount, projected yearly earnings, and a monthly sparkline. Use when the user asks about yield, earnings, or how much they have earned.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context): Promise<ToolResult<YieldSummary>> {
    const apiUrl = context.env?.ALLOWANCE_API_URL;
    const address = context.walletAddress;

    const empty: YieldSummary = {
      today: 0, thisWeek: 0, thisMonth: 0, allTime: 0,
      currentApy: 0, deposited: 0, projectedYear: 0, sparkline: [],
    };

    if (!apiUrl || !address) {
      return { data: empty, displayText: 'Yield summary not available.' };
    }

    try {
      const res = await fetch(
        `${apiUrl}/api/analytics/yield-summary?address=${address}`,
        { headers: { 'x-sui-address': address }, signal: context.signal },
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
  },
});
