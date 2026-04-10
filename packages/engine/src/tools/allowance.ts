import { z } from 'zod';
import { buildTool } from '../tool.js';

export const allowanceStatusTool = buildTool({
  name: 'allowance_status',
  description:
    'Check the agent spending allowance status: whether it is enabled, the daily USDC limit, amount spent today, remaining budget, which service categories are permitted, and when the budget resets. Use this when the user asks about their agent budget, spending limits, or autonomous transaction permissions.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (!context.env?.ALLOWANCE_API_URL || !context.walletAddress) {
      return {
        data: {
          enabled: false,
          dailyLimit: 0,
          spent: 0,
          remaining: 0,
          permissions: [],
          resetsAt: null,
        },
        displayText: 'Agent allowance is not configured.',
      };
    }

    const disabledResult = {
      data: {
        enabled: false,
        dailyLimit: 0,
        spent: 0,
        remaining: 0,
        permissions: [] as string[],
        resetsAt: null as string | null,
      },
      displayText: 'Unable to fetch allowance status.',
    };

    let allowance: {
      enabled: boolean;
      dailyLimit: number;
      spent: number;
      remaining: number;
      permissions: string[];
      resetsAt: string | null;
    };

    try {
      const url = `${context.env.ALLOWANCE_API_URL}/api/allowance/${context.walletAddress}`;
      const res = await fetch(url, {
        signal: context.signal,
        headers: context.env.AUDRIC_INTERNAL_KEY
          ? { 'x-internal-key': context.env.AUDRIC_INTERNAL_KEY }
          : undefined,
      });

      if (!res.ok) return disabledResult;
      allowance = (await res.json()) as typeof allowance;
    } catch {
      return disabledResult;
    }

    const statusText = allowance.enabled
      ? `Allowance active: $${allowance.spent.toFixed(2)} / $${allowance.dailyLimit.toFixed(2)} used today. ${allowance.permissions.length} service categories enabled.`
      : 'Agent allowance is disabled.';

    return {
      data: allowance,
      displayText: statusText,
    };
  },
});
