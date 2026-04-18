import { z } from 'zod';
import { buildTool } from '../tool.js';
import type { ToolResult } from '../types.js';

interface SpendingResponse {
  period: string;
  totalSpent: number;
  requestCount: number;
  serviceCount: number;
  byService: unknown[];
}

export const spendingAnalyticsTool = buildTool({
  name: 'spending_analytics',
  description:
    'Returns MPP service spending breakdown for a period. Shows total spent, request count, and breakdown by service/category. Use when the user asks about their API spending, service usage, or costs.',
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

  async call(input, context): Promise<ToolResult<SpendingResponse>> {
    const period = input.period ?? 'month';
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const address = context.walletAddress;
    const empty: SpendingResponse = { period, totalSpent: 0, requestCount: 0, serviceCount: 0, byService: [] };

    if (!apiUrl || !address) {
      return { data: empty, displayText: 'Spending analytics not available.' };
    }

    try {
      const res = await fetch(
        `${apiUrl}/api/analytics/spending?address=${address}&period=${period}`,
        {
          headers: { 'x-sui-address': address },
          signal: context.signal,
        },
      );

      if (!res.ok) {
        return { data: empty, displayText: `Could not fetch spending data (HTTP ${res.status}).` };
      }

      const data = (await res.json()) as SpendingResponse;
      const total = data.totalSpent ?? 0;
      const count = data.requestCount ?? 0;

      return {
        data,
        displayText: total > 0
          ? `You spent $${total.toFixed(2)} across ${count} request${count !== 1 ? 's' : ''} on ${data.serviceCount} service${data.serviceCount !== 1 ? 's' : ''} (${data.period}).`
          : `No service spending recorded for ${data.period}.`,
      };
    } catch {
      return { data: empty, displayText: 'Error fetching spending analytics.' };
    }
  },
});
