import { z } from 'zod';
import { buildTool } from '../tool.js';

const STAGE_LABELS: Record<number, string> = {
  0: 'Detected',
  1: 'Proposed',
  2: 'Confirmed (notifies)',
  3: 'Fully autonomous',
};

const PATTERN_LABELS: Record<string, string> = {
  recurring_save: 'Recurring Save',
  yield_reinvestment: 'Yield Reinvestment',
  debt_discipline: 'Debt Discipline',
  idle_usdc_tolerance: 'Idle USDC Sweep',
  swap_pattern: 'Regular Swap',
};

function getApiConfig(context: { env?: Record<string, string>; walletAddress?: string }) {
  const apiUrl = context.env?.ALLOWANCE_API_URL;
  const internalKey = context.env?.AUDRIC_INTERNAL_KEY;
  const address = context.walletAddress;
  return { apiUrl, internalKey, address };
}

export const patternStatusTool = buildTool({
  name: 'pattern_status',
  description:
    'Show all detected behavioral patterns and autonomous automations for this user. Includes pattern type, trust stage, execution count, and next scheduled run.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,
  permissionLevel: 'auto',

  async call(_input, context) {
    const { apiUrl, internalKey, address } = getApiConfig(context);
    if (!apiUrl || !address) {
      return { data: null, displayText: 'Pattern status is not available.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/scheduled-actions?address=${address}`, {
        headers: {
          ...(internalKey ? { 'x-internal-key': internalKey } : {}),
        },
      });

      if (!res.ok) {
        return { data: null, displayText: 'Failed to fetch pattern status.' };
      }

      const { actions } = await res.json() as {
        actions: Array<{
          id: string; actionType: string; amount: number; asset: string;
          cronExpr: string; enabled: boolean; nextRunAt: string;
          source: string; stage: number; patternType: string | null;
          confidence: number | null; pausedAt: string | null;
          totalExecutions: number; totalAmountUsdc: number;
          confirmationsCompleted: number; confirmationsRequired: number;
        }>;
      };

      const patterns = actions.filter((a) => a.source === 'behavior_detected');
      const userCreated = actions.filter((a) => a.source !== 'behavior_detected');

      if (patterns.length === 0 && userCreated.length === 0) {
        return {
          data: { patterns: [], userCreated: [] },
          displayText: 'No automations or detected patterns yet. As you use Audric, I\'ll learn your financial patterns and suggest automations.',
        };
      }

      const lines: string[] = [];

      if (patterns.length > 0) {
        lines.push('**Detected Patterns:**');
        for (const p of patterns) {
          const label = PATTERN_LABELS[p.patternType ?? ''] ?? p.patternType ?? 'Unknown';
          const stage = STAGE_LABELS[p.stage] ?? `Stage ${p.stage}`;
          const status = p.pausedAt ? 'Paused' : !p.enabled ? 'Disabled' : stage;
          const next = p.enabled && !p.pausedAt
            ? new Date(p.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : '—';
          lines.push(`• ${label}: auto-${p.actionType} $${p.amount} ${p.asset} — ${status} — ${p.totalExecutions} runs — next: ${next}`);
        }
      }

      if (userCreated.length > 0) {
        lines.push('');
        lines.push('**User-Created Schedules:**');
        for (const a of userCreated) {
          const status = !a.enabled ? 'paused'
            : a.confirmationsCompleted >= a.confirmationsRequired ? 'autonomous'
            : `${a.confirmationsCompleted}/${a.confirmationsRequired} confirmed`;
          const next = new Date(a.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          lines.push(`• ${a.actionType} $${a.amount} ${a.asset} — ${status} — next: ${next}`);
        }
      }

      return {
        data: { patterns, userCreated },
        displayText: lines.join('\n'),
      };
    } catch (err) {
      return { data: null, displayText: `Failed: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  },
});

export const pausePatternTool = buildTool({
  name: 'pause_pattern',
  description:
    'Pause, resume, or permanently disable a behavioral pattern automation. Requires user confirmation.',
  inputSchema: z.object({
    patternId: z.string().describe('ID of the pattern/scheduled action to modify'),
    action: z.enum(['pause', 'resume', 'disable']).describe('pause, resume, or disable'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      patternId: { type: 'string', description: 'Pattern ID' },
      action: { type: 'string', enum: ['pause', 'resume', 'disable'], description: 'pause, resume, or disable' },
    },
    required: ['patternId', 'action'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const { apiUrl, internalKey, address } = getApiConfig(context);
    if (!apiUrl || !address) {
      return { data: null, displayText: 'Pattern management is not available.' };
    }

    const patchAction = input.action === 'pause' ? 'pause_pattern'
      : input.action === 'resume' ? 'resume_pattern'
      : 'delete';

    try {
      const res = await fetch(`${apiUrl}/api/scheduled-actions/${input.patternId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(internalKey ? { 'x-internal-key': internalKey } : {}),
        },
        body: JSON.stringify({ address, action: patchAction }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, displayText: `Failed to ${input.action}: ${(err as { error?: string }).error ?? res.statusText}` };
      }

      const label = input.action === 'pause' ? 'Paused' : input.action === 'resume' ? 'Resumed' : 'Disabled';
      return {
        data: { id: input.patternId, action: input.action },
        displayText: `${label} pattern ${input.patternId.slice(0, 8)}…`,
      };
    } catch (err) {
      return { data: null, displayText: `Failed: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  },
});
