import { z } from 'zod';
import { buildTool } from '../tool.js';
import type { ToolResult } from '../types.js';

interface ActionBreakdown {
  action: string;
  count: number;
  totalAmountUsd: number;
}

interface ActivitySummary {
  period: string;
  totalTransactions: number;
  byAction: ActionBreakdown[];
  totalMovedUsd: number;
  netSavingsUsd: number;
  yieldEarnedUsd: number;
}

export const activitySummaryTool = buildTool({
  name: 'activity_summary',
  description:
    'Returns a categorised DeFi activity summary for a period: transaction count, breakdown by action type (saves, sends, borrows, repayments, swaps, payments), total moved, net savings change, and yield earned. Use when the user asks about their activity, transaction history summary, or what they have done recently.',
  inputSchema: z.object({
    period: z
      .enum(['week', 'month', 'year', 'all'])
      .optional()
      .describe('Time period. Defaults to current month.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['week', 'month', 'year', 'all'] },
    },
  },
  isReadOnly: true,

  async call(input, context): Promise<ToolResult<ActivitySummary>> {
    const period = input.period ?? 'month';
    const apiUrl = context.env?.ALLOWANCE_API_URL;
    const address = context.walletAddress;

    const empty: ActivitySummary = {
      period, totalTransactions: 0, byAction: [],
      totalMovedUsd: 0, netSavingsUsd: 0, yieldEarnedUsd: 0,
    };

    if (!apiUrl || !address) {
      return { data: empty, displayText: 'Activity summary not available.' };
    }

    try {
      const res = await fetch(
        `${apiUrl}/api/analytics/activity-summary?address=${address}&period=${period}`,
        { headers: { 'x-sui-address': address }, signal: context.signal },
      );

      if (!res.ok) {
        return { data: empty, displayText: `Could not fetch activity data (HTTP ${res.status}).` };
      }

      const data = (await res.json()) as ActivitySummary;
      const sorted = [...(data.byAction ?? [])].sort((a, b) => b.count - a.count);
      const top = sorted
        .slice(0, 3)
        .map((a) => `${a.action} (${a.count})`)
        .join(', ');

      const periodLabel = data.period === 'all' ? 'all time' : `this ${data.period}`;

      return {
        data,
        displayText: data.totalTransactions > 0
          ? `${data.totalTransactions} transactions ${periodLabel}. Top: ${top}. Total moved: $${data.totalMovedUsd.toFixed(2)}. Net savings: $${data.netSavingsUsd.toFixed(2)}.`
          : `No activity recorded for ${periodLabel}.`,
      };
    } catch {
      return { data: empty, displayText: 'Error fetching activity summary.' };
    }
  },
});
