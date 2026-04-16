import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary, buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { sendEmail } from '../../services/email.js';
import { executeAdminTx } from '../../services/sui-executor.js';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 2000;
const FEATURE_KEY = 'briefing';
const BRIEFING_CHARGE = 5000n; // $0.005 USDC (6 decimals)
const MIN_IDLE_USDC = 1; // only send if user has >= $1 idle or savings

export interface GoalProgress {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  progress: number;
  remaining: number;
}

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
  goals?: GoalProgress[];
  autonomySummary?: string;
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

function utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
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

  const goalsHtml = content.goals?.length
    ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">Savings Goals</p>
        ${content.goals.map((g) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span>${g.emoji}</span>
          <span style="color:#374151;font-size:13px;flex:1;">${g.name}</span>
          <span style="color:#111;font-size:13px;font-weight:600;">${g.progress}%</span>
        </div>
        <div style="height:4px;background:#f3f4f6;border-radius:2px;margin-bottom:10px;">
          <div style="height:100%;background:${g.progress >= 100 ? '#10b981' : '#111'};border-radius:2px;width:${g.progress}%;"></div>
        </div>`).join('')}
      </div>`
    : '';

  const autonomyHtml = content.autonomySummary
    ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Automations</p>
        <p style="color:#374151;font-size:13px;margin:0;">${content.autonomySummary}</p>
      </div>`
    : '';

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">☀️ Morning Briefing · ${dateLabel}</p>
      <h2 style="margin:0 0 8px;color:#111;font-size:18px;font-weight:600;">${headline}</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>
      ${ctaHtml}
      ${goalsHtml}
      ${autonomyHtml}
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
  emailSent = true,
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
        ...(emailSent && { emailSentAt: new Date().toISOString() }),
        chargeDigest,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[briefing] Failed to store briefing for ${walletAddress}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

interface InternalGoal {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  deadline: string | null;
  currentMilestone: number;
  status: string;
}

async function fetchGoals(walletAddress: string): Promise<InternalGoal[]> {
  try {
    const res = await fetch(
      `${getInternalUrl()}/api/internal/goals?address=${walletAddress}`,
      { headers: { 'x-internal-key': getInternalKey() } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { goals?: InternalGoal[] };
    return data.goals ?? [];
  } catch {
    return [];
  }
}

function buildGoalProgress(goals: InternalGoal[], savingsBalance: number): GoalProgress[] {
  return goals.map((g) => {
    const progress = Math.min(Math.round((savingsBalance / g.targetAmount) * 100), 100);
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      targetAmount: g.targetAmount,
      progress,
      remaining: Math.max(g.targetAmount - savingsBalance, 0),
    };
  });
}

const MILESTONES = [25, 50, 75, 100] as const;

function detectNewMilestone(progress: number, currentMilestone: number): number | null {
  for (const m of MILESTONES) {
    if (progress >= m && currentMilestone < m) return m;
  }
  return null;
}

async function updateGoalMilestone(goalId: string, milestone: number, status?: string): Promise<void> {
  try {
    const body: Record<string, unknown> = { goalId, currentMilestone: milestone };
    if (status) body.status = status;
    await fetch(`${getInternalUrl()}/api/internal/goals`, {
      method: 'PATCH',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

function buildMilestoneEmailHtml(
  goalName: string,
  goalEmoji: string,
  milestone: number,
  savingsBalance: number,
  targetAmount: number,
): string {
  const isComplete = milestone >= 100;
  const headline = isComplete
    ? `${goalEmoji} You reached your "${goalName}" goal!`
    : `${goalEmoji} ${milestone}% of your "${goalName}" goal!`;
  const body = isComplete
    ? `Congratulations! Your savings reached ${fmtUsd(savingsBalance)}, hitting your ${fmtUsd(targetAmount)} target. Time to set a new goal or celebrate.`
    : `Your savings balance (${fmtUsd(savingsBalance)}) is ${milestone}% of the way to ${fmtUsd(targetAmount)}. Keep going!`;

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">🎯 Goal Milestone</p>
      <h2 style="margin:0 0 8px;color:#111;font-size:18px;font-weight:600;">${headline}</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>
      <div style="height:6px;background:#f3f4f6;border-radius:3px;margin-bottom:16px;">
        <div style="height:100%;background:${isComplete ? '#10b981' : '#111'};border-radius:3px;width:${Math.min(milestone, 100)}%;"></div>
      </div>
      <a href="https://audric.ai/settings?section=goals" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">${isComplete ? 'Set a new goal' : 'View goals'} →</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        <a href="https://audric.ai/settings?section=features" style="color:#9ca3af;">Notification settings</a>
        · <a href="https://audric.ai" style="color:#9ca3af;">Open Audric</a>
      </p>
    </div>
  `.trim();
}

async function processMilestones(
  user: NotificationUser,
  goals: InternalGoal[],
  savingsBalance: number,
): Promise<void> {
  for (const goal of goals) {
    const progress = Math.min(Math.round((savingsBalance / goal.targetAmount) * 100), 100);
    const newMilestone = detectNewMilestone(progress, goal.currentMilestone);

    if (newMilestone === null) continue;

    await updateGoalMilestone(
      goal.id,
      newMilestone,
      newMilestone >= 100 ? 'completed' : undefined,
    );

    await storeAppEvent(user.walletAddress, 'goal_milestone', `${goal.emoji} ${goal.name} — ${newMilestone}%`, {
      goalId: goal.id,
      goalName: goal.name,
      milestone: newMilestone,
      savingsBalance,
      targetAmount: goal.targetAmount,
    });

    await sendEmail({
      to: user.email,
      subject: newMilestone >= 100
        ? `🎉 You reached your "${goal.name}" savings goal!`
        : `${goal.emoji} ${newMilestone}% — "${goal.name}" savings goal`,
      html: buildMilestoneEmailHtml(goal.name, goal.emoji, newMilestone, savingsBalance, goal.targetAmount),
      tags: [
        { name: 'category', value: 'goal_milestone' },
        { name: 'milestone', value: String(newMilestone) },
      ],
    });
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
  const date = utcDateStr();

  try {
    if (!user.allowanceId) {
      return 'skipped';
    }

    const alreadySent = await checkBriefingExists(user.walletAddress, date);
    if (alreadySent) return 'skipped';

    const [summary, goals] = await Promise.all([
      withRetry(() => getFinancialSummary(client, user.walletAddress, {
        allowanceId: user.allowanceId ?? undefined,
      })),
      fetchGoals(user.walletAddress),
    ]);

    if (summary.savingsBalance === 0 && summary.idleUsdc < MIN_IDLE_USDC) {
      return 'skipped';
    }

    const content = buildBriefingContent(summary);
    if (goals.length > 0) {
      content.goals = buildGoalProgress(goals, summary.savingsBalance);
    }

    // Phase D: fetch yesterday's autonomous execution summary
    try {
      const autonomyRes = await fetch(
        `${getInternalUrl()}/api/internal/autonomous-spend?address=${user.walletAddress}`,
        { headers: { 'x-internal-key': getInternalKey() } },
      );
      if (autonomyRes.ok) {
        const autonomyData = (await autonomyRes.json()) as { totalUsd?: number };
        if (autonomyData.totalUsd && autonomyData.totalUsd > 0) {
          content.autonomySummary = `Auto-saved $${autonomyData.totalUsd.toFixed(2)} yesterday. Savings balance: ${fmtUsd(summary.savingsBalance)}.`;
        }
      }
    } catch { /* best effort */ }

    // Charge allowance first — if it fails, skip this user
    // Rebuild tx on each retry so object versions are fresh
    let chargeDigest: string | null = null;
    try {
      const aid = user.allowanceId;
      const result = await withRetry(() => {
        const tx = buildDeductAllowanceTx(aid, BRIEFING_CHARGE, ALLOWANCE_FEATURES.BRIEFING);
        return executeAdminTx(tx);
      });
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

    await storeBriefing(user.walletAddress, date, content, chargeDigest, !!emailResult);

    if (goals.length > 0) {
      await processMilestones(user, goals, summary.savingsBalance).catch((err) =>
        console.warn(`[briefing] Milestone check failed for ${user.walletAddress}:`, err instanceof Error ? err.message : err),
      );
    }

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

  return { job: 'briefings', processed: eligible.length, sent, errors };
}

export { buildBriefingContent, buildSubject, buildEmailHtml, deriveCta, deriveVariant, utcDateStr };
