import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { ALLOWANCE_FEATURES, buildDeductAllowanceTx } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import { executeAdminTx } from '../../services/sui-executor.js';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 2000;
const FEATURE_KEY = 'briefing';
const WEEKLY_CHARGE = 5000n; // $0.005 USDC

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface WeeklyData {
  netWorthChange: number;
  netWorthChangePct: number;
  yieldEarned: number;
  transactionCount: number;
  servicesUsed: number;
  servicesCost: number;
  currentNetWorth: number;
}

async function fetchWeeklyData(walletAddress: string): Promise<WeeklyData | null> {
  try {
    const res = await fetch(
      `${getInternalUrl()}/api/analytics/weekly-summary?address=${walletAddress}`,
      { headers: { 'x-internal-key': getInternalKey() } },
    );
    if (!res.ok) return null;
    return (await res.json()) as WeeklyData;
  } catch {
    return null;
  }
}

async function checkBriefingExists(walletAddress: string, date: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${getInternalUrl()}/api/internal/briefing?walletAddress=${walletAddress}&date=${date}`,
      { headers: { 'x-internal-key': getInternalKey() } },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { exists: boolean };
    return data.exists;
  } catch {
    return false;
  }
}

async function storeBriefing(
  walletAddress: string,
  date: string,
  content: unknown,
  chargeDigest: string | null,
): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/briefing`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        date,
        content,
        emailSentAt: new Date().toISOString(),
        chargeDigest,
      }),
    });
  } catch {
    // best effort
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1) return `$${Math.abs(n).toFixed(2)}`;
  if (Math.abs(n) > 0) return `$${Math.abs(n).toFixed(4).replace(/0+$/, '')}`;
  return '$0.00';
}

function dateRangeLabel(): string {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(weekAgo)}–${fmt(now)}`;
}

function buildWeeklyEmailHtml(data: WeeklyData): string {
  const range = dateRangeLabel();
  const trend = data.netWorthChangePct >= 0
    ? `▲ +${data.netWorthChangePct.toFixed(1)}%`
    : `▼ ${data.netWorthChangePct.toFixed(1)}%`;
  const trendColor = data.netWorthChangePct >= 0 ? '#10b981' : '#ef4444';

  const rows = [
    { label: 'Net Worth', value: fmtUsd(data.currentNetWorth), extra: `<span style="color:${trendColor};font-size:12px;">${trend}</span>` },
    { label: 'Yield Earned', value: `+${fmtUsd(data.yieldEarned)}`, extra: '' },
    { label: 'Transactions', value: String(data.transactionCount), extra: '' },
  ];

  if (data.servicesUsed > 0) {
    rows.push({ label: 'Services Used', value: String(data.servicesUsed), extra: `(${fmtUsd(data.servicesCost)})` });
  }

  const rowsHtml = rows.map((r) =>
    `<tr><td style="color:#6b7280;padding:4px 0;">${r.label}</td><td style="text-align:right;font-family:monospace;padding:4px 0;">${r.value} ${r.extra}</td></tr>`,
  ).join('');

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">📊 Weekly Summary · ${range}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111;">
        ${rowsHtml}
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        <a href="https://audric.ai/settings?section=features" style="color:#9ca3af;">Turn off in Settings</a>
        · <a href="https://audric.ai" style="color:#9ca3af;">Open Audric</a>
      </p>
    </div>
  `.trim();
}

type ProcessResult = 'sent' | 'skipped' | 'error';

async function processUser(
  _client: SuiJsonRpcClient,
  user: NotificationUser,
): Promise<ProcessResult> {
  const weeklyDate = `weekly-${new Date().toISOString().slice(0, 10)}`;

  try {
    if (!user.allowanceId) return 'skipped';

    const exists = await checkBriefingExists(user.walletAddress, weeklyDate);
    if (exists) return 'skipped';

    const data = await fetchWeeklyData(user.walletAddress);
    if (!data) return 'skipped';
    if (data.transactionCount === 0 && data.yieldEarned === 0) return 'skipped';

    let chargeDigest: string | null = null;
    try {
      const aid = user.allowanceId;
      const result = await withRetry(() => {
        const tx = buildDeductAllowanceTx(aid, WEEKLY_CHARGE, ALLOWANCE_FEATURES.BRIEFING);
        return executeAdminTx(tx);
      });
      if (result.status !== 'success') {
        console.warn(`[weekly_briefing] Charge failed for ${user.walletAddress}: tx ${result.digest} status=${result.status}`);
        return 'skipped';
      }
      chargeDigest = result.digest;
    } catch (err) {
      console.warn(`[weekly_briefing] Charge error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
      return 'skipped';
    }

    const range = dateRangeLabel();
    await sendEmail({
      to: user.email,
      subject: `📊 Your week in review — ${range}`,
      html: buildWeeklyEmailHtml(data),
      tags: [
        { name: 'category', value: 'weekly_briefing' },
      ],
    });

    const content = { variant: 'weekly', ...data };
    await storeBriefing(user.walletAddress, weeklyDate, content, chargeDigest);

    return 'sent';
  } catch (err) {
    console.error(`[weekly_briefing] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function runWeeklyBriefing(
  client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const eligible = users.filter((u) => u.prefs[FEATURE_KEY] !== false);
  let sent = 0;
  let errors = 0;

  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

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

  return { job: 'weekly_briefing', processed: eligible.length, sent, errors };
}
