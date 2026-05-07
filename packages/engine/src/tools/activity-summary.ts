import { z } from 'zod';
import { buildTool } from '../tool.js';
import { normalizeAddressInput } from '../sui/address.js';
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
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

export const activitySummaryTool = buildTool({
  name: 'activity_summary',
  description:
    'Returns a categorised DeFi activity summary for the signed-in user OR any public Sui address or SuiNS name: transaction count, breakdown by action type (saves, sends, borrows, repayments, swaps, payments), total moved, net savings change, and yield earned. Use when the user asks about activity, transaction history summary, or what someone has done recently. Pass `address` as a 0x address OR a SuiNS name (e.g. "alex.sui") to inspect a contact / watched / public wallet; defaults to the signed-in user when omitted.',
  inputSchema: z.object({
    period: z
      .enum(['week', 'month', 'year', 'all'])
      .optional()
      .describe('Time period. Defaults to current month.'),
    address: z
      .string()
      .optional()
      .describe('Sui address (0x…) or SuiNS name (alex.sui). Defaults to the signed-in wallet when omitted.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['week', 'month', 'year', 'all'] },
      address: {
        type: 'string',
        description: 'Sui address (0x…) or SuiNS name (e.g. alex.sui). The engine resolves the name to an on-chain address before querying. Omit to default to the signed-in wallet.',
      },
    },
  },
  isReadOnly: true,

  async call(input, context): Promise<ToolResult<ActivitySummary>> {
    const period = input.period ?? 'month';
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;

    // [v1.2 SuiNS] Normalize the user-supplied address (0x or *.sui).
    let suinsName: string | null = null;
    let targetAddress: string | undefined;
    if (input.address) {
      const normalized = await normalizeAddressInput(input.address, {
        suiRpcUrl: context.suiRpcUrl,
        signal: context.signal,
      });
      targetAddress = normalized.address;
      suinsName = normalized.suinsName;
    } else {
      targetAddress = context.walletAddress;
    }
    const isSelfQuery =
      !!context.walletAddress &&
      !!targetAddress &&
      targetAddress.toLowerCase() === context.walletAddress.toLowerCase();

    const empty: ActivitySummary = {
      period, totalTransactions: 0, byAction: [],
      totalMovedUsd: 0, netSavingsUsd: 0, yieldEarnedUsd: 0,
      address: targetAddress, isSelfQuery, suinsName,
    };

    if (!apiUrl || !targetAddress) {
      return { data: empty, displayText: 'Activity summary not available.' };
    }

    try {
      const callerHeader = context.walletAddress ?? targetAddress;
      const res = await fetch(
        `${apiUrl}/api/analytics/activity-summary?address=${targetAddress}&period=${period}`,
        { headers: { 'x-sui-address': callerHeader }, signal: context.signal },
      );

      if (!res.ok) {
        return { data: empty, displayText: `Could not fetch activity data (HTTP ${res.status}).` };
      }

      const raw = (await res.json()) as ActivitySummary;
      const data: ActivitySummary = { ...raw, address: targetAddress, isSelfQuery, suinsName };
      const sorted = [...(data.byAction ?? [])].sort((a, b) => b.count - a.count);
      const top = sorted
        .slice(0, 3)
        .map((a) => `${a.action} (${a.count})`)
        .join(', ');

      const periodLabel = data.period === 'all' ? 'all time' : `this ${data.period}`;
      const subjectLabel = suinsName ?? `${targetAddress.slice(0, 6)}…${targetAddress.slice(-4)}`;
      const subjectPrefix = isSelfQuery ? '' : `${subjectLabel} — `;

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
