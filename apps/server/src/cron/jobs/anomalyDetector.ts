import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary } from '@t2000/sdk';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 10;
const BATCH_DELAY_MS = 100;

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface Anomaly {
  triggerType: string;
  message: string;
  ctaType: string;
  ctaAmount: number | null;
  priority: 'urgent' | 'normal';
  deliveryMethod: string;
}

async function canSendFollowUp(userId: string, priority: string): Promise<boolean> {
  if (priority === 'urgent') return true;
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/follow-up-queue?userId=${userId}&pending=true`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { entries?: Array<{ priority: string; createdAt: string }> };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = (data.entries ?? []).filter((e) =>
      e.priority !== 'urgent' && new Date(e.createdAt) >= today,
    ).length;
    return todayCount < 2;
  } catch {
    return false;
  }
}

async function hasDuplicateFollowUp(userId: string, ctaType: string): Promise<boolean> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/follow-up-queue?userId=${userId}&pending=true`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { entries?: Array<{ ctaType: string | null; sentAt: string | null; scheduledFor: string }> };
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return (data.entries ?? []).some((e) =>
      e.ctaType === ctaType && !e.sentAt && new Date(e.scheduledFor).getTime() > oneDayAgo,
    );
  } catch {
    return false;
  }
}

async function queueFollowUp(data: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/follow-up-queue`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch { /* best effort */ }
}

async function fetchUserGoals(walletAddress: string): Promise<Array<{
  id: string;
  name: string;
  targetAmount: number;
  deadline: string | null;
  totalDeposited: number;
}>> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/goals?address=${walletAddress}`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { goals?: Array<{
      id: string; name: string; targetAmount: number; deadline: string | null;
      deposits?: Array<{ amountUsdc: number }>;
    }> };
    return (data.goals ?? []).map((g) => ({
      ...g,
      totalDeposited: (g.deposits ?? []).reduce((s, d) => s + d.amountUsdc, 0),
    }));
  } catch {
    return [];
  }
}

async function detectAnomalies(
  client: SuiJsonRpcClient,
  user: NotificationUser,
): Promise<Anomaly[]> {
  const summary = await withRetry(() => getFinancialSummary(client, user.walletAddress, {
    allowanceId: user.allowanceId ?? undefined,
  }));

  const anomalies: Anomaly[] = [];

  // 1. Idle USDC > $100 for > 48h
  if (summary.idleUsdc > 100) {
    anomalies.push({
      triggerType: 'anomaly',
      message: `You have $${summary.idleUsdc.toFixed(2)} idle USDC. Save it to earn ${(summary.saveApy * 100).toFixed(1)}% APY.`,
      ctaType: 'save',
      ctaAmount: Math.floor(summary.idleUsdc),
      priority: 'normal',
      deliveryMethod: 'in_app',
    });
  }

  // 2. Health factor < 1.5
  if (summary.healthFactor > 0 && summary.healthFactor < 1.5 && summary.debtBalance > 0) {
    anomalies.push({
      triggerType: 'anomaly',
      message: `Your health factor is ${summary.healthFactor.toFixed(2)} — risk of liquidation. Repay debt to bring it above 2.0.`,
      ctaType: 'repay',
      ctaAmount: null,
      priority: 'urgent',
      deliveryMethod: 'both',
    });
  }

  // 3. Goals behind schedule
  const goals = await fetchUserGoals(user.walletAddress);
  for (const goal of goals) {
    if (!goal.deadline) continue;
    const daysRemaining = (new Date(goal.deadline).getTime() - Date.now()) / 86400000;
    if (daysRemaining <= 0 || daysRemaining >= 60) continue;

    const remaining = goal.targetAmount - goal.totalDeposited;
    if (remaining <= 0) continue;

    const requiredDaily = remaining / daysRemaining;
    const currentDailyYield = summary.savingsBalance * summary.saveApy / 365;

    if (requiredDaily > currentDailyYield * 5) {
      const weeklyDeposit = Math.round(requiredDaily * 7);
      anomalies.push({
        triggerType: 'anomaly',
        message: `Your "${goal.name}" goal is falling behind. You need ~$${weeklyDeposit}/week to meet your deadline.`,
        ctaType: 'goal_deposit',
        ctaAmount: weeklyDeposit,
        priority: 'normal',
        deliveryMethod: 'in_app',
      });
    }
  }

  return anomalies;
}

async function processUser(
  client: SuiJsonRpcClient,
  user: NotificationUser,
): Promise<'sent' | 'skipped' | 'error'> {
  try {
    if (!user.allowanceId) return 'skipped';

    const anomalies = await detectAnomalies(client, user);
    if (anomalies.length === 0) return 'skipped';

    let queued = false;
    for (const anomaly of anomalies) {
      const duplicate = await hasDuplicateFollowUp(user.userId, anomaly.ctaType);
      if (duplicate) continue;

      const allowed = await canSendFollowUp(user.userId, anomaly.priority);
      if (!allowed) continue;

      await queueFollowUp({
        userId: user.userId,
        triggerType: anomaly.triggerType,
        message: anomaly.message,
        ctaType: anomaly.ctaType,
        ctaAmount: anomaly.ctaAmount,
        priority: anomaly.priority,
        deliveryMethod: anomaly.deliveryMethod,
      });
      queued = true;
    }

    return queued ? 'sent' : 'skipped';
  } catch (err) {
    console.error(`[anomaly-detector] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function detectAnomaliesJob(
  client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const eligible = users.filter((u) => u.allowanceId);
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

  return { job: 'anomaly_detector', processed: eligible.length, sent, errors };
}
