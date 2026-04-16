import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFinancialSummary } from '@t2000/sdk';
import type { JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 2000;

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface PendingAdvice {
  id: string;
  userId: string;
  adviceType: string;
  targetAmount: number | null;
  goalId: string | null;
  actionTaken: boolean;
  followUpDue: string | null;
  followUpSent: boolean;
  outcomeStatus: string;
  createdAt: string;
  walletAddress: string;
  allowanceId: string | null;
  goal: {
    id: string;
    name: string;
    emoji: string;
    targetAmount: number;
    deadline: string | null;
    status: string;
    totalDeposited: number;
  } | null;
}

function shouldAbandon(advice: PendingAdvice, onTrack: boolean | null): boolean {
  // Goal + missed deadline
  if (advice.adviceType === 'goal' && advice.goal?.deadline) {
    const deadline = new Date(advice.goal.deadline);
    if (deadline < new Date() && onTrack !== true) return true;
  }

  // Double follow-up window with no action
  if (advice.followUpSent && advice.followUpDue && !advice.actionTaken) {
    const created = new Date(advice.createdAt).getTime();
    const followUpDue = new Date(advice.followUpDue).getTime();
    const window = followUpDue - created;
    if (Date.now() > followUpDue + window) return true;
  }

  return false;
}

async function fetchPendingAdvice(): Promise<PendingAdvice[]> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/advice-pending`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { adviceLogs?: PendingAdvice[] };
    return data.adviceLogs ?? [];
  } catch {
    return [];
  }
}

async function storeOutcomeCheck(data: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/outcome-check`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as { check?: { id: string } };
    return result.check?.id ?? null;
  } catch {
    return null;
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

async function canSendFollowUp(userId: string, priority: string): Promise<boolean> {
  if (priority === 'urgent') return true;

  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/follow-up-queue?userId=${userId}&pending=true`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { entries?: Array<{ priority: string; sentAt: string | null; createdAt: string }> };
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

async function processAdvice(
  client: SuiJsonRpcClient,
  advice: PendingAdvice,
): Promise<'checked' | 'skipped' | 'error'> {
  try {
    const summary = await withRetry(() => getFinancialSummary(client, advice.walletAddress, {
      allowanceId: advice.allowanceId ?? undefined,
    }));

    let onTrack: boolean | null = null;
    let actualValue: number | null = null;
    let expectedValue: number | null = advice.targetAmount;
    let message: string | null = null;
    let ctaType: string | null = null;
    let ctaAmount: number | null = null;
    let checkType = 'savings_delta';

    switch (advice.adviceType) {
      case 'save': {
        onTrack = summary.savingsBalance > 0 && advice.actionTaken;
        actualValue = summary.savingsBalance;
        if (!onTrack) {
          const idle = summary.idleUsdc;
          if (idle > 1) {
            message = `You still have $${idle.toFixed(2)} idle USDC. Saving it at ${(summary.saveApy * 100).toFixed(1)}% APY would earn ~$${(idle * summary.saveApy / 365).toFixed(4)}/day.`;
            ctaType = 'save';
            ctaAmount = advice.targetAmount ?? idle;
          }
        }
        break;
      }

      case 'goal': {
        checkType = 'goal_progress';
        if (!advice.goal) break;
        const deposited = advice.goal.totalDeposited;
        expectedValue = advice.goal.targetAmount;
        actualValue = deposited;

        if (deposited >= advice.goal.targetAmount) {
          onTrack = true;
          message = `${advice.goal.emoji} You reached your "${advice.goal.name}" goal! $${deposited.toFixed(2)} deposited.`;
          ctaType = 'none';
        } else if (advice.goal.deadline) {
          const daysRemaining = Math.max(1, (new Date(advice.goal.deadline).getTime() - Date.now()) / (86400000));
          const requiredDaily = (advice.goal.targetAmount - deposited) / daysRemaining;
          const currentDailyYield = summary.savingsBalance * summary.saveApy / 365;
          onTrack = requiredDaily <= currentDailyYield * 5;
          if (!onTrack) {
            const weeklyDeposit = Math.round(requiredDaily * 7);
            message = `Your "${advice.goal.name}" goal needs ~$${weeklyDeposit}/week to stay on track.`;
            ctaType = 'goal_deposit';
            ctaAmount = weeklyDeposit;
          }
        }
        break;
      }

      case 'repay': {
        checkType = 'debt_change';
        actualValue = summary.debtBalance;
        expectedValue = advice.targetAmount ?? 0;
        onTrack = summary.debtBalance < (advice.targetAmount ?? summary.debtBalance + 1);
        if (!onTrack && summary.healthFactor < 2.0) {
          message = `Your health factor is ${summary.healthFactor.toFixed(2)}. Consider repaying to stay safe.`;
          ctaType = 'repay';
          ctaAmount = advice.targetAmount;
        }
        break;
      }

      default:
        return 'skipped';
    }

    // Determine outcome status
    let outcomeStatus: string;
    const isCompleted = (advice.adviceType === 'goal' && actualValue !== null && advice.goal && actualValue >= advice.goal.targetAmount)
      || (advice.adviceType === 'save' && onTrack === true);

    if (isCompleted) {
      outcomeStatus = 'completed';
    } else if (shouldAbandon(advice, onTrack)) {
      outcomeStatus = 'abandoned';
    } else if (onTrack === true) {
      outcomeStatus = 'on_track';
    } else if (onTrack === false) {
      outcomeStatus = 'off_track';
    } else {
      outcomeStatus = 'pending';
    }

    const checkId = await storeOutcomeCheck({
      adviceLogId: advice.id,
      checkType,
      expectedValue,
      actualValue,
      deltaUsdc: actualValue !== null && expectedValue !== null ? actualValue - expectedValue : null,
      onTrack,
      outcomeStatus,
      followUpSent: message !== null,
    });

    // Queue follow-up if applicable
    if (message && outcomeStatus !== 'abandoned' && checkId) {
      const allowed = await canSendFollowUp(advice.userId, 'normal');
      if (allowed) {
        await queueFollowUp({
          userId: advice.userId,
          triggerType: isCompleted ? 'goal_milestone' : 'off_track',
          adviceLogId: advice.id,
          outcomeCheckId: checkId,
          message,
          ctaType,
          ctaAmount,
          priority: 'normal',
          deliveryMethod: 'in_app',
        });
      }
    }

    return 'checked';
  } catch (err) {
    console.error(`[outcome-checker] Error for advice ${advice.id}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function runOutcomeChecks(
  client: SuiJsonRpcClient,
): Promise<JobResult> {
  const pending = await fetchPendingAdvice();
  if (pending.length === 0) {
    return { job: 'outcome_checker', processed: 0, sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((advice) => processAdvice(client, advice)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'checked') sent++;
        else if (r.value === 'error') errors++;
      } else {
        errors++;
      }
    }
  }

  return { job: 'outcome_checker', processed: pending.length, sent, errors };
}
