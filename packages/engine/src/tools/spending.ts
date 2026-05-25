import { tool } from 'ai';
import { z } from 'zod';
// [SPEC AI SDK HARDENING P4.1 Batch 4 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import type { ToolContext, ToolResult } from '../types.js';

interface SpendingResponse {
  period: string;
  totalSpent: number;
  requestCount: number;
  serviceCount: number;
  byService: unknown[];
}

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const spendingAnalyticsDescription =
  'Returns MPP service spending breakdown for a period. Shows total spent, request count, and breakdown by service/category. Use when the user asks about their API spending, service usage, or costs. ' +
  // SPEC 23B-N3 (2026-05-12): when the user wants to SEE their spending — phrased as "show me", "breakdown", "where did my money go", "spending chart", "what am I spending on" — prefer `render_canvas("spending_breakdown")` instead. The canvas opens an interactive panel with rich visuals; this tool returns a flat numeric summary. Reserve `spending_analytics` for narrow numerical questions ("how much did I spend on resend last week?") where a single sentence answers it. The canvas pulls the same data, so visual queries should never see a flat text fallback.
  'For visual queries — "show me my spending", "spending breakdown", "what did I spend on", "spending chart" — prefer `render_canvas` with `template: "spending_breakdown"` instead. That opens an interactive panel with rich visuals; this tool returns a flat numeric summary best suited to narrow questions ("how much on resend last week?").';

const spendingAnalyticsInputSchema = z.object({
  period: z
    .enum(['week', 'month', 'year', 'all'])
    .optional()
    .describe('Time period. Defaults to current month.'),
});

type SpendingAnalyticsInput = z.infer<typeof spendingAnalyticsInputSchema>;

async function spendingAnalyticsCallBody(
  input: SpendingAnalyticsInput,
  context: ToolContext,
): Promise<ToolResult<SpendingResponse>> {
    const period = input.period ?? 'month';
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const address = context.walletAddress;
    const empty: SpendingResponse = { period, totalSpent: 0, requestCount: 0, serviceCount: 0, byService: [] };

    if (!apiUrl || !address) {
      return { data: empty, displayText: 'Spending analytics not available.' };
    }

    try {
      const internalKey = context.env?.AUDRIC_INTERNAL_KEY;
      // [Day 20d / 2026-05-17] See activity-summary.ts — engine path uses
      // `x-internal-key` so `authenticateAnalyticsRequest()` accepts the call
      // server-side (JWT-only auth would 401 the engine on every read).
      const res = await fetch(
        `${apiUrl}/api/analytics/spending?address=${address}&period=${period}`,
        {
          headers: {
            'x-sui-address': address,
            ...(internalKey ? { 'x-internal-key': internalKey } : {}),
          },
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
}

export const spendingAnalyticsTool = tool({
  description: spendingAnalyticsDescription,
  inputSchema: spendingAnalyticsInputSchema,
  needsApproval: buildNeedsApproval('spending_analytics'),
  execute: wrapEngineExecute<SpendingAnalyticsInput, SpendingResponse>(
    'spending_analytics',
    { call: spendingAnalyticsCallBody },
  ),
});
