import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary, buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import { executeAdminTx } from '../../services/sui-executor.js';
import type { NotificationUser, JobResult } from '../types.js';

const CONCURRENCY = 10;
const FEATURE_KEY = 'briefing';
const BRIEFING_CHARGE = 5000n; // $0.005 USDC (6 decimals)
const MIN_IDLE_USDC = 1; // only send if user has >= $1 idle or savings

export interface BriefingContent {
  earned: number;
  savingsBalance: number;
  saveApy: number;
  idleUsdc: number;
  projectedDailyGain: number;
  healthFactor: number | null;
  debtBalance: number;
  cta: { type: string; label: string; amount?: number } | null;
  variant: 'savings' | 'idle' | 'debt_warning';
}

function deriveCta(content: BriefingContent): BriefingContent['cta'] {
  if (content.healthFactor !== null && content.healthFactor < 2 && content.debtBalance > 0) {
    return { type: 'repay', label: 'Repay debt' };
  }
  if (content.idleUsdc > 5) {
    return { type: 'save', label: 'Save idle USDC', amount: Math.floor(content.idleUsdc) };
  }
  return null;
}

function deriveVariant(content: Pick<BriefingContent, 'savingsBalance' | 'healthFactor' | 'debtBalance'>): BriefingContent['variant'] {
  if (content.healthFactor !== null && content.healthFactor < 2 && content.debtBalance > 0) {
    return 'debt_warning';
  }
  if (content.savingsBalance > 0) return 'savings';
  return 'idle';
}

function buildBriefingContent(summary: {
  savingsBalance: number;
  dailyYield: number;
  saveApy: number;
  idleUsdc: number;
  healthFactor: number;
  debtBalance: number;
}): BriefingContent {
  const projectedDailyGain = summary.idleUsdc * (summary.saveApy / 365);
  const partial: Omit<BriefingContent, 'cta' | 'variant'> = {
    earned: summary.dailyYield,
    savingsBalance: summary.savingsBalance,
    saveApy: summary.saveApy,
    idleUsdc: summary.idleUsdc,
    projectedDailyGain,
    healthFactor: summary.debtBalance > 0 ? summary.healthFactor : null,
    debtBalance: summary.debtBalance,
  };

  const variant = deriveVariant(partial);
  const content: BriefingContent = { ...partial, variant, cta: null };
  content.cta = deriveCta(content);
  return content;
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4).replace(/0+$/, '')}`;
  return '$0.00';
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function userLocalDateStr(timezoneOffset: number): string {
  const now = new Date();
  const localMs = now.getTime() - timezoneOffset * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function briefingDateLabel(timezoneOffset: number): string {
  const now = new Date();
  const localMs = now.getTime() - timezoneOffset * 60 * 1000;
  return new Date(localMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// -------------------------------------------------------------------------
// Email template
// -------------------------------------------------------------------------

function buildSubject(content: BriefingContent, timezoneOffset: number): string {
  const dateLabel = briefingDateLabel(timezoneOffset);
  if (content.variant === 'savings' && content.earned > 0) {
    return `Your ${fmtUsd(content.earned)} overnight — ${dateLabel}`;
  }
  if (content.variant === 'idle') {
    return `Your idle USDC could be earning — ${dateLabel}`;
  }
  return `Morning briefing — ${dateLabel}`;
}

function buildEmailHtml(content: BriefingContent, timezoneOffset: number): string {
  const dateLabel = briefingDateLabel(timezoneOffset);

  let headline = '';
  let body = '';

  if (content.variant === 'savings') {
    headline = `Your USDC savings earned ${fmtUsd(content.earned)} overnight.`;
    body = `USDC savings: ${fmtUsd(content.savingsBalance)} at ${fmtPct(content.saveApy)} APY`;
    if (content.idleUsdc > 5) {
      body += `<br/><br/>You have ${fmtUsd(content.idleUsdc)} idle USDC. Saving it would add ~${fmtUsd(content.projectedDailyGain)} per day.`;
    }
  } else if (content.variant === 'idle') {
    headline = `You have ${fmtUsd(content.idleUsdc)} idle USDC.`;
    body = `Save it to start earning ${fmtPct(content.saveApy)} APY — that's ~${fmtUsd(content.idleUsdc * (content.saveApy / 365))} per day.`;
  } else {
    headline = `Your health factor is ${content.healthFactor?.toFixed(2) ?? 'N/A'}.`;
    body = `You have ${fmtUsd(content.debtBalance)} in debt. Consider repaying to stay safe.`;
  }

  const ctaHtml = content.cta
    ? `<a href="https://audric.ai/action?type=${content.cta.type}${content.cta.amount ? `&amount=${content.cta.amount}` : ''}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:16px;">${content.cta.label} →</a>`
    : '';

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">☀️ Morning Briefing · ${dateLabel}</p>
      <h2 style="margin:0 0 8px;color:#111;font-size:18px;font-weight:600;">${headline}</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>
      ${ctaHtml}
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        <a href="https://audric.ai/settings?section=features" style="color:#9ca3af;">Turn off in Settings</a>
        · <a href="https://audric.ai" style="color:#9ca3af;">Open Audric</a>
      </p>
    </div>
  `.trim();
}

// -------------------------------------------------------------------------
// Internal API: store briefing in audric NeonDB
// -------------------------------------------------------------------------

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function storeBriefing(
  walletAddress: string,
  date: string,
  content: BriefingContent,
  chargeDigest: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/briefing`, {
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
    return res.ok;
  } catch (err) {
    console.error(`[briefing] Failed to store briefing for ${walletAddress}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function checkBriefingExists(walletAddress: string, date: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${getInternalUrl()}/api/internal/briefing?walletAddress=${walletAddress}&date=${date}`,
      {
        headers: {
          'x-internal-key': getInternalKey(),
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { exists: boolean };
    return data.exists;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------------
// Per-user processing
// -------------------------------------------------------------------------

type ProcessResult = 'sent' | 'skipped' | 'error';

async function processUser(
  client: SuiJsonRpcClient,
  user: NotificationUser,
): Promise<ProcessResult> {
  const date = userLocalDateStr(user.timezoneOffset);

  try {
    if (!user.allowanceId) {
      return 'skipped';
    }

    const alreadySent = await checkBriefingExists(user.walletAddress, date);
    if (alreadySent) return 'skipped';

    const summary = await getFinancialSummary(client, user.walletAddress, {
      allowanceId: user.allowanceId,
    });

    if (summary.savingsBalance === 0 && summary.idleUsdc < MIN_IDLE_USDC) {
      return 'skipped';
    }

    const content = buildBriefingContent(summary);

    // Charge allowance first — if it fails, skip this user
    let chargeDigest: string | null = null;
    try {
      const tx = buildDeductAllowanceTx(user.allowanceId, BRIEFING_CHARGE, ALLOWANCE_FEATURES.BRIEFING);
      const result = await executeAdminTx(tx);
      if (result.status !== 'success') {
        console.warn(`[briefing] Charge failed for ${user.walletAddress}: tx ${result.digest} status=${result.status}`);
        return 'skipped';
      }
      chargeDigest = result.digest;
    } catch (err) {
      console.warn(`[briefing] Charge error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
      return 'skipped';
    }

    const emailResult = await sendEmail({
      to: user.email,
      subject: buildSubject(content, user.timezoneOffset),
      html: buildEmailHtml(content, user.timezoneOffset),
      tags: [
        { name: 'category', value: 'briefing' },
        { name: 'variant', value: content.variant },
      ],
    });

    if (!emailResult) {
      console.error(`[briefing] Email send failed for ${user.walletAddress}`);
    }

    await storeBriefing(user.walletAddress, date, content, chargeDigest);

    return 'sent';
  } catch (err) {
    console.error(`[briefing] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

// -------------------------------------------------------------------------
// Job entry point
// -------------------------------------------------------------------------

export async function runBriefings(
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

  return { job: 'briefings', processed: eligible.length, sent, errors };
}

export { buildBriefingContent, buildSubject, buildEmailHtml, deriveCta, deriveVariant, userLocalDateStr };
