import { z } from 'zod';
import { buildTool } from '../tool.js';

function getApiConfig(context: { env?: Record<string, string>; walletAddress?: string }) {
  const apiUrl = context.env?.ALLOWANCE_API_URL;
  const internalKey = context.env?.AUDRIC_INTERNAL_KEY;
  const address = context.walletAddress;
  return { apiUrl, internalKey, address };
}

/**
 * Map natural-language schedule descriptions to cron expressions.
 * Supports: "every day at 9am", "every friday", "weekly", "monthly", "daily".
 */
function parseCronFromDescription(input: string): string {
  const lower = input.toLowerCase().trim();

  // Explicit cron expression
  if (/^\d+\s/.test(lower) || lower.startsWith('*')) return lower;

  // Named patterns
  if (/every\s*day|daily/.test(lower)) {
    const hourMatch = lower.match(/at\s*(\d{1,2})\s*(am|pm)?/i);
    let hour = 9;
    if (hourMatch) {
      hour = parseInt(hourMatch[1], 10);
      if (hourMatch[2]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (hourMatch[2]?.toLowerCase() === 'am' && hour === 12) hour = 0;
    }
    return `0 ${hour} * * *`;
  }

  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };

  for (const [name, num] of Object.entries(dayMap)) {
    if (lower.includes(name)) {
      const hourMatch = lower.match(/at\s*(\d{1,2})\s*(am|pm)?/i);
      let hour = 9;
      if (hourMatch) {
        hour = parseInt(hourMatch[1], 10);
        if (hourMatch[2]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (hourMatch[2]?.toLowerCase() === 'am' && hour === 12) hour = 0;
      }
      return `0 ${hour} * * ${num}`;
    }
  }

  if (/weekly/.test(lower)) return '0 9 * * 1'; // Monday 9am
  if (/monthly/.test(lower)) return '0 9 1 * *'; // 1st of month 9am
  if (/biweekly|bi-weekly|every\s*two\s*weeks/.test(lower)) return '0 9 1,15 * *'; // 1st and 15th

  throw new Error(`Could not parse schedule: "${input}". Try "every friday at 9am", "daily", "weekly", or a cron expression like "0 9 * * 5".`);
}

export const createScheduleTool = buildTool({
  name: 'create_schedule',
  description:
    'Create a recurring scheduled action (DCA). Supports: save, swap, repay. User says "save $50 every Friday" or "DCA $100 into savings weekly". First 5 executions require user confirmation (trust ladder), then becomes autonomous.',
  inputSchema: z.object({
    actionType: z.enum(['save', 'swap', 'repay']).describe('Action type: save, swap, or repay'),
    amount: z.number().positive().describe('Amount in USD for each execution'),
    schedule: z.string().describe('Schedule description: "every friday", "daily at 9am", "weekly", or a cron expression'),
    asset: z.string().optional().describe('Source asset (default: USDC)'),
    targetAsset: z.string().optional().describe('Target asset for swaps (e.g. SUI)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      actionType: { type: 'string', enum: ['save', 'swap', 'repay'], description: 'Action type' },
      amount: { type: 'number', description: 'Amount in USD per execution' },
      schedule: { type: 'string', description: 'Schedule: "every friday", "daily at 9am", "weekly", or cron' },
      asset: { type: 'string', description: 'Source asset (default: USDC)' },
      targetAsset: { type: 'string', description: 'Target asset for swaps' },
    },
    required: ['actionType', 'amount', 'schedule'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const { apiUrl, internalKey, address } = getApiConfig(context);
    if (!apiUrl || !address) {
      return { data: null, displayText: 'Scheduled actions are not available.' };
    }

    let cronExpr: string;
    try {
      cronExpr = parseCronFromDescription(input.schedule);
    } catch (err) {
      return { data: null, displayText: err instanceof Error ? err.message : 'Invalid schedule format.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/scheduled-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalKey ? { 'x-internal-key': internalKey } : {}),
        },
        body: JSON.stringify({
          address,
          actionType: input.actionType,
          amount: input.amount,
          asset: input.asset ?? 'USDC',
          targetAsset: input.targetAsset,
          cronExpr,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, displayText: `Failed to create schedule: ${(err as { error?: string }).error ?? res.statusText}` };
      }

      const { action } = await res.json() as { action: { id: string; nextRunAt: string } };
      const nextRun = new Date(action.nextRunAt);
      const nextRunLabel = nextRun.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const verb = input.actionType === 'save' ? 'save' : input.actionType === 'swap' ? 'swap' : 'repay';

      return {
        data: { id: action.id, actionType: input.actionType, amount: input.amount, cronExpr, nextRun: action.nextRunAt },
        displayText: `Scheduled: ${verb} $${input.amount.toFixed(2)} ${input.asset ?? 'USDC'} ${input.schedule}. Next run: ${nextRunLabel}. First 5 executions require your confirmation.`,
      };
    } catch (err) {
      return { data: null, displayText: `Schedule creation failed: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  },
});

export const listSchedulesTool = buildTool({
  name: 'list_schedules',
  description: 'List all scheduled/recurring actions (DCA, auto-save, auto-repay) for the user.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,
  permissionLevel: 'auto',

  async call(_input, context) {
    const { apiUrl, internalKey, address } = getApiConfig(context);
    if (!apiUrl || !address) {
      return { data: null, displayText: 'Scheduled actions are not available.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/scheduled-actions?address=${address}`, {
        headers: {
          ...(internalKey ? { 'x-internal-key': internalKey } : {}),
        },
      });

      if (!res.ok) {
        return { data: null, displayText: 'Failed to fetch schedules.' };
      }

      const { actions } = await res.json() as {
        actions: Array<{
          id: string; actionType: string; amount: number; asset: string;
          cronExpr: string; enabled: boolean; nextRunAt: string;
          confirmationsCompleted: number; confirmationsRequired: number;
          totalExecutions: number; totalAmountUsdc: number;
        }>;
      };

      if (actions.length === 0) {
        return { data: { actions: [] }, displayText: 'No scheduled actions found.' };
      }

      const lines = actions.map((a) => {
        const status = !a.enabled ? 'paused'
          : a.confirmationsCompleted >= a.confirmationsRequired ? 'autonomous'
          : `${a.confirmationsCompleted}/${a.confirmationsRequired} confirmed`;
        const next = new Date(a.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return `• ${a.actionType} $${a.amount.toFixed(2)} ${a.asset} — ${status} — next: ${next} — total: $${a.totalAmountUsdc.toFixed(2)} over ${a.totalExecutions} runs`;
      });

      return {
        data: { actions },
        displayText: `Found ${actions.length} scheduled action(s):\n${lines.join('\n')}`,
      };
    } catch (err) {
      return { data: null, displayText: `Failed to list schedules: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  },
});

export const cancelScheduleTool = buildTool({
  name: 'cancel_schedule',
  description: 'Cancel or pause a scheduled action. Provide the schedule ID or describe which one to cancel.',
  inputSchema: z.object({
    scheduleId: z.string().describe('The ID of the scheduled action to cancel/pause'),
    action: z.enum(['delete', 'pause', 'resume']).optional().describe('delete (default), pause, or resume'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', description: 'Schedule ID' },
      action: { type: 'string', enum: ['delete', 'pause', 'resume'], description: 'delete, pause, or resume' },
    },
    required: ['scheduleId'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const { apiUrl, internalKey, address } = getApiConfig(context);
    if (!apiUrl || !address) {
      return { data: null, displayText: 'Scheduled actions are not available.' };
    }

    const actionType = input.action ?? 'delete';

    try {
      const res = await fetch(`${apiUrl}/api/scheduled-actions/${input.scheduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(internalKey ? { 'x-internal-key': internalKey } : {}),
        },
        body: JSON.stringify({
          address,
          action: actionType,
          ...(actionType === 'pause' ? { enabled: false } : {}),
          ...(actionType === 'resume' ? { enabled: true } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, displayText: `Failed to ${actionType} schedule: ${(err as { error?: string }).error ?? res.statusText}` };
      }

      const label = actionType === 'delete' ? 'Cancelled' : actionType === 'pause' ? 'Paused' : 'Resumed';
      return {
        data: { id: input.scheduleId, action: actionType },
        displayText: `${label} scheduled action ${input.scheduleId.slice(0, 8)}…`,
      };
    } catch (err) {
      return { data: null, displayText: `Failed: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  },
});
