import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary, HF_WARN_THRESHOLD } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import type { NotificationUser, JobResult } from '../types.js';

const CONCURRENCY = 10;
const DEDUP_WARN_MS = 4 * 60 * 60 * 1000;
const FEATURE_KEY = 'hf_alert';

const lastWarnSent = new Map<string, number>();

function shouldSendWarn(userId: string): boolean {
  const last = lastWarnSent.get(userId);
  if (!last) return true;
  return Date.now() - last > DEDUP_WARN_MS;
}

function buildHFWarnHtml(hf: number, supplied: number, borrowed: number): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="background: #f59e0b15; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h2 style="margin: 0 0 8px; color: #f59e0b; font-size: 18px;">⚠️ Your health factor is getting low</h2>
        <p style="margin: 0; color: #374151; font-size: 14px;">
          Health factor: <strong>${hf.toFixed(2)}</strong> (warn threshold: ${HF_WARN_THRESHOLD})
        </p>
      </div>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        You have <strong>$${supplied.toFixed(2)}</strong> supplied and <strong>$${borrowed.toFixed(2)}</strong> borrowed.
        Consider repaying some debt to stay safe.
      </p>
      <a href="https://audric.ai/action?type=repay" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; margin-top: 8px;">
        Repay now →
      </a>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        You're receiving this because you have an active credit position on Audric.
      </p>
    </div>
  `;
}

async function processUser(
  client: SuiJsonRpcClient,
  user: NotificationUser,
): Promise<'sent' | 'skipped' | 'error'> {
  try {
    const summary = await getFinancialSummary(client, user.walletAddress, {
      allowanceId: user.allowanceId ?? undefined,
    });

    // Critical alerts are handled real-time by the indexer HF hook.
    // This batch job only handles warn-level as a safety net.
    if (summary.hfAlertLevel !== 'warn') return 'skipped';
    if (!shouldSendWarn(user.userId)) return 'skipped';

    const result = await sendEmail({
      to: user.email,
      subject: '⚠️ Your health factor is getting low',
      html: buildHFWarnHtml(
        summary.healthFactor,
        summary.savingsBalance,
        summary.debtBalance,
      ),
      tags: [
        { name: 'category', value: 'hf_alert' },
        { name: 'level', value: 'warn' },
      ],
    });

    if (result) {
      lastWarnSent.set(user.userId, Date.now());
      return 'sent';
    }
    return 'error';
  } catch (err) {
    console.error(`[hf-alert] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

/**
 * Warn-level HF alerts (hourly batch).
 * Critical alerts are handled real-time by the indexer HF hook — not here.
 * Processes users with bounded concurrency to avoid RPC rate limits.
 */
export async function runHFAlerts(
  client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const eligible = users.filter((u) => u.prefs[FEATURE_KEY] !== false);
  let sent = 0;
  let errors = 0;

  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    const batch = eligible.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((user) => processUser(client, user)),
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

  return { job: 'hf_alerts', processed: eligible.length, sent, errors };
}
