import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const FEATURE_KEY = 'rate_alert';
const CONCURRENCY = 3;
const BATCH_DELAY_MS = 500;
const RATE_CHANGE_THRESHOLD = 0.01; // 1% absolute change (e.g. 5% → 6% triggers)
const DEDUP_HOURS = 24;

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface RateAlertState {
  lastNotifiedRate: number | null;
  lastSentAt: string | null;
}

async function fetchRateAlertState(walletAddress: string): Promise<RateAlertState> {
  try {
    const res = await fetch(
      `${getInternalUrl()}/api/internal/rate-alert-state?address=${walletAddress}`,
      { headers: { 'x-internal-key': getInternalKey() } },
    );
    if (!res.ok) return { lastNotifiedRate: null, lastSentAt: null };
    return (await res.json()) as RateAlertState;
  } catch {
    return { lastNotifiedRate: null, lastSentAt: null };
  }
}

async function updateRateAlertState(walletAddress: string, rate: number): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/rate-alert-state`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: walletAddress, lastNotifiedRate: rate }),
    });
  } catch {
    // best effort
  }
}

async function storeAppEvent(walletAddress: string, type: string, title: string, details?: unknown): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/app-event`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: walletAddress, type, title, details }),
    });
  } catch {
    // best effort
  }
}

function fmtPct(rate: number): string {
  const pct = rate < 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}%`;
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4).replace(/0+$/, '')}`;
  return '$0.00';
}

function buildRateAlertEmail(params: {
  direction: 'up' | 'down';
  oldRate: number;
  newRate: number;
  idleUsdc: number;
  savingsBalance: number;
}): { subject: string; html: string } {
  const { direction, oldRate, newRate, idleUsdc, savingsBalance } = params;
  const arrow = direction === 'up' ? '📈' : '📉';
  const verb = direction === 'up' ? 'increased' : 'decreased';

  const subject = `${arrow} USDC savings rate ${verb} to ${fmtPct(newRate)}`;

  const dailyEarn = savingsBalance * (newRate < 1 ? newRate : newRate / 100) / 365;
  const bodyLines = [
    `The USDC savings rate on NAVI has ${verb} from ${fmtPct(oldRate)} to ${fmtPct(newRate)} APY.`,
  ];

  if (savingsBalance > 0) {
    bodyLines.push(`Your ${fmtUsd(savingsBalance)} in savings now earns ~${fmtUsd(dailyEarn)}/day.`);
  }

  if (direction === 'up' && idleUsdc > 5) {
    bodyLines.push(`You also have ${fmtUsd(idleUsdc)} idle USDC in your wallet — save it to earn ${fmtPct(newRate)} APY.`);
  }

  const ctaType = idleUsdc > 5 ? 'save' : 'briefing';
  const ctaLabel = idleUsdc > 5 ? `Save ${fmtUsd(Math.floor(idleUsdc))} USDC` : 'Open Audric';
  const ctaHref = idleUsdc > 5
    ? `https://audric.ai/action?type=save&amount=${Math.floor(idleUsdc)}`
    : 'https://audric.ai';

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">${arrow} Rate Alert</p>
      <h2 style="margin:0 0 8px;color:#111;font-size:18px;font-weight:600;">USDC savings rate ${verb} to ${fmtPct(newRate)}</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${bodyLines.join('<br/><br/>')}</p>
      <a href="${ctaHref}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">${ctaLabel} →</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        <a href="https://audric.ai/settings?section=features" style="color:#9ca3af;">Turn off in Settings</a>
        · <a href="https://audric.ai" style="color:#9ca3af;">Open Audric</a>
      </p>
    </div>
  `.trim();

  return { subject, html };
}

type ProcessResult = 'sent' | 'skipped' | 'error';

async function processUser(
  client: SuiJsonRpcClient,
  user: NotificationUser,
  currentRate: number | null,
): Promise<ProcessResult> {
  try {
    if (currentRate === null || currentRate <= 0) return 'skipped';

    const state = await fetchRateAlertState(user.walletAddress);

    if (state.lastSentAt) {
      const hoursSince = (Date.now() - new Date(state.lastSentAt).getTime()) / 3_600_000;
      if (hoursSince < DEDUP_HOURS) return 'skipped';
    }

    if (state.lastNotifiedRate === null) {
      await updateRateAlertState(user.walletAddress, currentRate);
      return 'skipped';
    }

    const normalizedCurrent = currentRate < 1 ? currentRate : currentRate / 100;
    const normalizedLast = state.lastNotifiedRate < 1 ? state.lastNotifiedRate : state.lastNotifiedRate / 100;
    const delta = Math.abs(normalizedCurrent - normalizedLast);

    if (delta < RATE_CHANGE_THRESHOLD) return 'skipped';

    const summary = await withRetry(() => getFinancialSummary(client, user.walletAddress, {
      allowanceId: user.allowanceId ?? undefined,
    }));

    const direction = normalizedCurrent > normalizedLast ? 'up' : 'down';
    const { subject, html } = buildRateAlertEmail({
      direction,
      oldRate: normalizedLast,
      newRate: normalizedCurrent,
      idleUsdc: summary.idleUsdc,
      savingsBalance: summary.savingsBalance,
    });

    await sendEmail({
      to: user.email,
      subject,
      html,
      tags: [
        { name: 'category', value: 'rate_alert' },
        { name: 'direction', value: direction },
      ],
    });

    await updateRateAlertState(user.walletAddress, currentRate);

    await storeAppEvent(user.walletAddress, 'rate_alert', subject, {
      oldRate: normalizedLast,
      newRate: normalizedCurrent,
      direction,
      idleUsdc: summary.idleUsdc,
    });

    return 'sent';
  } catch (err) {
    console.error(`[rate_alerts] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function runRateAlerts(
  client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const eligible = users.filter((u) => u.prefs[FEATURE_KEY] !== false);

  if (eligible.length === 0) {
    return { job: 'rate_alerts', processed: 0, sent: 0, errors: 0 };
  }

  let currentRate: number | null = null;
  try {
    const anySummary = await withRetry(() => getFinancialSummary(client, eligible[0].walletAddress, {
      allowanceId: eligible[0].allowanceId ?? undefined,
    }));
    currentRate = anySummary.saveApy;
  } catch (err) {
    console.error('[rate_alerts] Failed to fetch current rate:', err instanceof Error ? err.message : err);
    return { job: 'rate_alerts', processed: eligible.length, sent: 0, errors: 1 };
  }

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = eligible.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((user) => processUser(client, user, currentRate)),
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

  return { job: 'rate_alerts', processed: eligible.length, sent, errors };
}
