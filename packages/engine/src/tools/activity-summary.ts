import { z } from 'zod';
import { buildTool } from '../tool.js';
import type { ToolResult } from '../types.js';

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{1,64}$/;

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
  address?: string;
  isSelfQuery?: boolean;
}

export const activitySummaryTool = buildTool({
  name: 'activity_summary',
  description:
    'Returns a categorised DeFi activity summary for the signed-in user OR any public Sui address: transaction count, breakdown by action type (saves, sends, borrows, repayments, swaps, payments), total moved, net savings change, and yield earned. Use when the user asks about activity, transaction history summary, or what someone has done recently. Pass `address` to inspect a contact / watched / public wallet; defaults to the signed-in user when omitted.',
  inputSchema: z.object({
    period: z
      .enum(['week', 'month', 'year', 'all'])
      .optional()
      .describe('Time period. Defaults to current month.'),
    address: z
      .string()
      .regex(SUI_ADDRESS_REGEX)
      .optional()
      .describe('Sui address to inspect (defaults to the signed-in wallet)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['week', 'month', 'year', 'all'] },
      address: {
        type: 'string',
        pattern: '^0x[a-fA-F0-9]{1,64}$',
        description: 'Sui address to inspect (defaults to the signed-in wallet)',
      },
    },
  },
  isReadOnly: true,

  async call(input, context): Promise<ToolResult<ActivitySummary>> {
    /**
     * [v0.49] Address-scope: relays `input.address` (when provided) to
     * the audric `/api/analytics/activity-summary` endpoint instead of
     * always passing the signed-in user. The endpoint already accepts
     * an `address` query param, so the engine just stops hardcoding the
     * authenticated wallet.
     */
    const period = input.period ?? 'month';
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    const targetAddress = input.address ?? context.walletAddress;
    const isSelfQuery =
      !!context.walletAddress &&
      !!targetAddress &&
      targetAddress.toLowerCase() === context.walletAddress.toLowerCase();

    const empty: ActivitySummary = {
      period, totalTransactions: 0, byAction: [],
      totalMovedUsd: 0, netSavingsUsd: 0, yieldEarnedUsd: 0,
      address: targetAddress, isSelfQuery,
    };

    if (!apiUrl || !targetAddress) {
      return { data: empty, displayText: 'Activity summary not available.' };
    }

    try {
      // The host API uses the `address` query param as the read target;
      // the `x-sui-address` header is the authenticated caller. Sending
      // both lets the host authorise the read (signed-in user) while
      // scoping the response to the queried address.
      const callerHeader = context.walletAddress ?? targetAddress;
      const res = await fetch(
        `${apiUrl}/api/analytics/activity-summary?address=${targetAddress}&period=${period}`,
        { headers: { 'x-sui-address': callerHeader }, signal: context.signal },
      );

      if (!res.ok) {
        return { data: empty, displayText: `Could not fetch activity data (HTTP ${res.status}).` };
      }

      const raw = (await res.json()) as ActivitySummary;
      const data: ActivitySummary = { ...raw, address: targetAddress, isSelfQuery };
      const sorted = [...(data.byAction ?? [])].sort((a, b) => b.count - a.count);
      const top = sorted
        .slice(0, 3)
        .map((a) => `${a.action} (${a.count})`)
        .join(', ');

      const periodLabel = data.period === 'all' ? 'all time' : `this ${data.period}`;
      const subjectPrefix = isSelfQuery
        ? ''
        : `${targetAddress.slice(0, 6)}…${targetAddress.slice(-4)} — `;

      return {
        data,
        displayText: data.totalTransactions > 0
          ? `${subjectPrefix}${data.totalTransactions} transactions ${periodLabel}. Top: ${top}. Total moved: $${data.totalMovedUsd.toFixed(2)}. Net savings: $${data.netSavingsUsd.toFixed(2)}.`
          : `${subjectPrefix}No activity recorded for ${periodLabel}.`,
      };
    } catch {
      return { data: empty, displayText: 'Error fetching activity summary.' };
    }
  },
});
