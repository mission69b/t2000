import { z } from 'zod';
import { buildTool } from '../tool.js';

// ---------------------------------------------------------------------------
// Shared helper — calls the Audric PATCH /api/allowance/[address] endpoint
// ---------------------------------------------------------------------------

async function patchAllowance(
  apiUrl: string,
  walletAddress: string,
  internalKey: string | undefined,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ data: unknown; displayText: string } | null> {
  const res = await fetch(`${apiUrl}/api/allowance/${walletAddress}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': internalKey ?? '',
      'x-sui-address': walletAddress,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ data: unknown; displayText: string }>;
}

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

// ---------------------------------------------------------------------------
// AC-2: toggle_allowance
// ---------------------------------------------------------------------------

export const toggleAllowanceTool = buildTool({
  name: 'toggle_allowance',
  description:
    'Pause or resume the agent spending allowance. Use when the user says "pause my agent", "disable autonomous spending", "resume my agent", or similar. ALWAYS confirm with the user before calling — e.g. "Pause agent spending? Your daily limit will be suspended." Only call after explicit confirmation.',
  inputSchema: z.object({
    enabled: z.boolean().describe('true to enable agent spending, false to pause it'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'true to enable, false to pause' },
    },
    required: ['enabled'],
  },
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.ALLOWANCE_API_URL;
    const internalKey = context.env?.AUDRIC_INTERNAL_KEY;

    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Allowance management is not available.' };
    }

    try {
      const result = await patchAllowance(apiUrl, context.walletAddress, internalKey, {
        action: 'toggle',
        enabled: input.enabled,
      }, context.signal);

      if (!result) return { data: null, displayText: 'Failed to update allowance.' };

      const action = input.enabled ? 'enabled' : 'paused';
      return {
        data: result,
        displayText: `Agent spending ${action}.`,
      };
    } catch {
      return { data: null, displayText: 'Failed to update allowance.' };
    }
  },
});

// ---------------------------------------------------------------------------
// AC-3: update_daily_limit
// ---------------------------------------------------------------------------

export const updateDailyLimitTool = buildTool({
  name: 'update_daily_limit',
  description:
    'Update the agent\'s daily spending limit in USDC. Use when the user says "set my daily limit to $X", "change my spending cap", or similar. ALWAYS confirm with the user before calling — show the current limit and the new limit. Only call after explicit confirmation.',
  inputSchema: z.object({
    dailyLimitUsdc: z.number().min(0).max(10000).describe('New daily limit in USDC (0–10000)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      dailyLimitUsdc: { type: 'number', description: 'New daily spending limit in USDC (0–10000)' },
    },
    required: ['dailyLimitUsdc'],
  },
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.ALLOWANCE_API_URL;
    const internalKey = context.env?.AUDRIC_INTERNAL_KEY;

    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Allowance management is not available.' };
    }

    try {
      const result = await patchAllowance(apiUrl, context.walletAddress, internalKey, {
        action: 'setLimit',
        dailyLimitUsdc: input.dailyLimitUsdc,
      }, context.signal);

      if (!result) return { data: null, displayText: 'Failed to update daily limit.' };

      return {
        data: result,
        displayText: `Daily limit updated to $${input.dailyLimitUsdc.toFixed(2)} USDC.`,
      };
    } catch {
      return { data: null, displayText: 'Failed to update daily limit.' };
    }
  },
});

// ---------------------------------------------------------------------------
// AC-4: update_permissions
// ---------------------------------------------------------------------------

export const updatePermissionsTool = buildTool({
  name: 'update_permissions',
  description:
    'Update which service categories the agent is allowed to act on autonomously. Valid permissions: savings, send, pay, credit, swap, stake. Use when the user says "disable sends", "only allow savings", "enable all services", or similar. ALWAYS show the current permissions and the new permissions before calling. Only call after explicit confirmation.',
  inputSchema: z.object({
    permissions: z
      .array(z.enum(['savings', 'send', 'pay', 'credit', 'swap', 'stake']))
      .describe('Full list of enabled permission categories'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      permissions: {
        type: 'array',
        items: { type: 'string', enum: ['savings', 'send', 'pay', 'credit', 'swap', 'stake'] },
        description: 'Full list of enabled permission categories',
      },
    },
    required: ['permissions'],
  },
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.ALLOWANCE_API_URL;
    const internalKey = context.env?.AUDRIC_INTERNAL_KEY;

    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Allowance management is not available.' };
    }

    try {
      const result = await patchAllowance(apiUrl, context.walletAddress, internalKey, {
        action: 'setPermissions',
        permissions: input.permissions,
      }, context.signal);

      if (!result) return { data: null, displayText: 'Failed to update permissions.' };

      const list = input.permissions.length > 0 ? input.permissions.join(', ') : 'none';
      return {
        data: result,
        displayText: `Permissions updated: ${list}.`,
      };
    } catch {
      return { data: null, displayText: 'Failed to update permissions.' };
    }
  },
});
