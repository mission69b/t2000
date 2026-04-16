import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { executeAdminTx } from '../../services/sui-executor.js';
import { sendEmail } from '../../services/email.js';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 2000;
const REMIND_CHARGE = 1000n; // $0.001 USDC (6 decimals)

interface DueAction {
  id: string;
  actionType: string;
  amount: number;
  asset: string;
  nextRunAt: string;
  confirmationsCompleted: number;
  confirmationsRequired: number;
  isAutonomous: boolean;
  walletAddress: string;
  email: string | null;
  allowanceId: string | null;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function storeAppEvent(
  walletAddress: string,
  type: string,
  title: string,
  details?: unknown,
): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/app-event`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: walletAddress, type, title, details }),
    });
  } catch { /* best effort */ }
}

async function fetchUpcomingActions(): Promise<DueAction[]> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/scheduled-actions/due?window=24h`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { actions?: DueAction[] };
    return data.actions ?? [];
  } catch {
    return [];
  }
}

function buildReminderEmailHtml(action: DueAction): string {
  const nextRun = new Date(action.nextRunAt);
  const timeLabel = nextRun.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const verb = action.actionType === 'save' ? 'save' : action.actionType === 'swap' ? 'swap' : 'repay';
  const trustStatus = action.isAutonomous
    ? 'This will execute automatically.'
    : `Confirmation required (${action.confirmationsCompleted}/${action.confirmationsRequired}).`;

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">🔔 Scheduled Action Reminder</p>
      <h2 style="margin:0 0 8px;color:#111;font-size:18px;font-weight:600;">
        Audric will ${verb} $${action.amount.toFixed(2)} ${action.asset} tomorrow
      </h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Scheduled for ${timeLabel}. ${trustStatus}
      </p>
      <a href="https://audric.ai/settings?section=schedules" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px;">
        Manage schedules →
      </a>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        <a href="https://audric.ai/settings?section=features" style="color:#9ca3af;">Turn off in Settings</a>
      </p>
    </div>
  `.trim();
}

type ProcessResult = 'sent' | 'skipped' | 'error';

async function processReminder(
  action: DueAction,
  usersMap: Map<string, NotificationUser>,
): Promise<ProcessResult> {
  try {
    if (!action.allowanceId) return 'skipped';

    // Charge for the reminder
    try {
      const aid = action.allowanceId;
      const result = await withRetry(() => {
        const tx = buildDeductAllowanceTx(aid, REMIND_CHARGE, ALLOWANCE_FEATURES.ACTION_REMIND);
        return executeAdminTx(tx);
      });
      if (result.status !== 'success') return 'skipped';
    } catch {
      return 'skipped';
    }

    const verb = action.actionType === 'save' ? 'save' : action.actionType === 'swap' ? 'swap' : 'repay';
    const nextRun = new Date(action.nextRunAt);
    const timeLabel = nextRun.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // In-app notification
    await storeAppEvent(action.walletAddress, 'schedule_reminder', `Reminder: ${verb} $${action.amount.toFixed(2)} ${timeLabel}`, {
      actionId: action.id,
      actionType: action.actionType,
      amount: action.amount,
      asset: action.asset,
      nextRunAt: action.nextRunAt,
      isAutonomous: action.isAutonomous,
    });

    // Email (if user has email)
    const user = usersMap.get(action.walletAddress);
    if (action.email && user) {
      await sendEmail({
        to: action.email,
        subject: `Reminder: Auto-${verb} $${action.amount.toFixed(2)} tomorrow`,
        html: buildReminderEmailHtml(action),
        tags: [{ name: 'category', value: 'schedule_reminder' }],
      }).catch(() => {});
    }

    return 'sent';
  } catch (err) {
    console.error(`[schedule-reminder] Error for action ${action.id}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function runScheduledReminders(
  _client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const upcoming = await fetchUpcomingActions();
  if (upcoming.length === 0) {
    return { job: 'scheduled_reminders', processed: 0, sent: 0, errors: 0 };
  }

  const usersMap = new Map<string, NotificationUser>();
  for (const u of users) usersMap.set(u.walletAddress, u);

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < upcoming.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = upcoming.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((action) => processReminder(action, usersMap)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'sent') sent++;
        else if (r.value === 'error') errors++;
      } else {
        errors++;
      }
    }
  }

  return { job: 'scheduled_reminders', processed: upcoming.length, sent, errors };
}
