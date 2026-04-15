import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { executeAdminTx } from '../../services/sui-executor.js';
import { runAutonomySafetyChecks, type SafetyContext } from './autonomy-safety.js';
import { checkCircuitBreaker, pauseAction } from './circuit-breaker.js';
import type { JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 500;
const DCA_CHARGE = 10_000n; // $0.01 USDC (6 decimals) per execution

interface DueAction {
  id: string;
  userId: string;
  actionType: string;
  amount: number;
  asset: string;
  targetAsset: string | null;
  cronExpr: string;
  nextRunAt: string;
  confirmationsRequired: number;
  confirmationsCompleted: number;
  totalExecutions: number;
  isAutonomous: boolean;
  walletAddress: string;
  email: string | null;
  allowanceId: string | null;
  source: string;
  stage: number;
  patternType: string | null;
  pausedAt: string | null;
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

async function updateAction(
  actionId: string,
  walletAddress: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/scheduled-actions/${actionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': getInternalKey(),
      },
      body: JSON.stringify({ address: walletAddress, ...patch }),
    });
  } catch { /* best effort */ }
}

async function logExecution(
  scheduledActionId: string,
  idempotencyKey: string,
  amountUsd: number,
  status: string,
  opts?: { txDigest?: string; skipReason?: string },
): Promise<{ conflict: boolean }> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/autonomous-execution`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scheduledActionId,
        idempotencyKey,
        amountUsd,
        status,
        txDigest: opts?.txDigest,
        skipReason: opts?.skipReason,
      }),
    });

    if (res.status === 409) return { conflict: true };
    return { conflict: false };
  } catch {
    return { conflict: false };
  }
}

async function sendEmail(
  walletAddress: string,
  templateType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/internal/send-autonomous-email`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: walletAddress, templateType, data }),
    });
  } catch { /* best effort */ }
}

function buildIdempotencyKey(actionId: string, cronExpr: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  const parts = cronExpr.split(' ');

  // Monthly: day-of-month is a specific number, month and day-of-week are wildcards
  if (parts.length >= 5 && parts[2] !== '*' && parts[3] === '*' && parts[4] === '*') {
    return `action:${actionId}:${year}-${month}`;
  }

  // Weekly: day-of-week is specified (not wildcard)
  if (parts.length >= 5 && parts[4] !== '*') {
    const weekNum = getISOWeek(now);
    return `action:${actionId}:${year}-W${String(weekNum).padStart(2, '0')}`;
  }

  // Default: daily
  return `action:${actionId}:${year}-${month}-${day}`;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

async function fetchDueActions(): Promise<DueAction[]> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/scheduled-actions/due`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { actions?: DueAction[] };
    return data.actions ?? [];
  } catch {
    return [];
  }
}

type ProcessResult = 'executed' | 'confirmation_sent' | 'skipped' | 'error';

async function processAction(
  _client: SuiJsonRpcClient,
  action: DueAction,
): Promise<ProcessResult> {
  try {
    if (action.pausedAt) {
      return 'skipped';
    }

    // Behavior-detected actions go through the autonomous pipeline (requires allowance)
    if (action.source === 'behavior_detected') {
      if (!action.allowanceId) {
        console.warn(`[scheduled-actions] No allowance for ${action.walletAddress}, skipping autonomous action`);
        return 'skipped';
      }
      return processAutonomousAction(_client, action);
    }

    // User-created actions still building trust: send confirmation to next chat session (no charge)
    if (!action.isAutonomous) {
      await storeAppEvent(action.walletAddress, 'schedule_confirm', 'Confirm scheduled action', {
        actionId: action.id,
        actionType: action.actionType,
        amount: action.amount,
        asset: action.asset,
        confirmationsCompleted: action.confirmationsCompleted,
        confirmationsRequired: action.confirmationsRequired,
      });
      await updateAction(action.id, action.walletAddress, { action: 'skip' });
      return 'confirmation_sent';
    }

    // Autonomous user-created action — charge and notify (requires allowance)
    if (!action.allowanceId) {
      console.warn(`[scheduled-actions] No allowance for ${action.walletAddress}, skipping autonomous action`);
      return 'skipped';
    }
    return executeWithChargeAndNotify(_client, action);
  } catch (err) {
    console.error(`[scheduled-actions] Error for action ${action.id}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

async function processAutonomousAction(
  _client: SuiJsonRpcClient,
  action: DueAction,
): Promise<ProcessResult> {
  // Idempotency check
  const idempotencyKey = buildIdempotencyKey(action.id, action.cronExpr);
  const { conflict } = await logExecution(action.id, idempotencyKey, 0, 'pending');
  if (conflict) {
    console.log(`[scheduled-actions] Idempotency key already exists for ${action.id}, skipping`);
    return 'skipped';
  }

  // Circuit breaker check
  const circuitState = await checkCircuitBreaker(action.id);
  if (circuitState.tripped) {
    console.warn(`[scheduled-actions] Circuit breaker tripped for ${action.id} (${circuitState.consecutiveFailures} failures)`);
    await pauseAction(action.id, action.walletAddress);
    await sendEmail(action.walletAddress, 'circuit_breaker', {
      actionType: action.actionType,
      amount: action.amount,
      asset: action.asset,
      patternType: action.patternType,
      failures: circuitState.consecutiveFailures,
    });
    await logExecution(action.id, idempotencyKey, 0, 'skipped', {
      skipReason: `circuit_breaker: ${circuitState.consecutiveFailures} consecutive failures`,
    });
    return 'skipped';
  }

  // Safety checks
  const safetyCtx: SafetyContext = {
    walletAddress: action.walletAddress,
    actionType: action.actionType,
    amount: action.amount,
    asset: action.asset,
    stage: action.stage,
  };
  const safety = await runAutonomySafetyChecks(safetyCtx);
  if (!safety.safe) {
    console.warn(`[scheduled-actions] Safety check failed for ${action.id}: ${safety.reason}`);

    await logExecution(action.id, idempotencyKey, 0, 'skipped', {
      skipReason: safety.reason,
    });

    // Stage 3: notify on unexpected skip
    if (action.stage >= 3) {
      await sendEmail(action.walletAddress, 'stage3_unexpected', {
        actionType: action.actionType,
        amount: action.amount,
        asset: action.asset,
        patternType: action.patternType,
        reason: safety.reason,
      });
    }

    await storeAppEvent(action.walletAddress, 'autonomous_skip', `Auto-${action.actionType} skipped`, {
      actionId: action.id,
      reason: safety.reason,
    });

    await updateAction(action.id, action.walletAddress, { action: 'skip' });
    return 'skipped';
  }

  // Execute: charge allowance + store AppEvent for client-side execution
  const result = await executeWithChargeAndNotify(_client, action);

  if (result === 'executed') {
    await logExecution(action.id, idempotencyKey, action.amount, 'success');

    // Stage 2: email notification
    if (action.stage === 2) {
      await sendEmail(action.walletAddress, 'stage2_execution', {
        actionType: action.actionType,
        amount: action.amount,
        asset: action.asset,
        patternType: action.patternType,
        executionNumber: action.totalExecutions + 1,
        confirmationsRequired: action.confirmationsRequired,
      });
    }

    await storeAppEvent(action.walletAddress, 'autonomous_execute', `Auto-${action.actionType} $${action.amount.toFixed(2)}`, {
      actionId: action.id,
      actionType: action.actionType,
      amount: action.amount,
      asset: action.asset,
      stage: action.stage,
      patternType: action.patternType,
    });
  } else {
    await logExecution(action.id, idempotencyKey, 0, 'failed', {
      skipReason: 'charge_failed',
    });
  }

  return result;
}

async function executeWithChargeAndNotify(
  _client: SuiJsonRpcClient,
  action: DueAction,
): Promise<ProcessResult> {
  try {
    const result = await withRetry(() => {
      const tx = buildDeductAllowanceTx(action.allowanceId!, DCA_CHARGE, ALLOWANCE_FEATURES.DCA);
      return executeAdminTx(tx);
    });
    if (result.status !== 'success') {
      console.warn(`[scheduled-actions] Charge failed for ${action.walletAddress}: ${result.digest}`);
      return 'skipped';
    }
  } catch (err) {
    console.warn(`[scheduled-actions] Charge error for ${action.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'skipped';
  }

  await storeAppEvent(action.walletAddress, 'schedule_execute', `Auto-${action.actionType} $${action.amount.toFixed(2)}`, {
    actionId: action.id,
    actionType: action.actionType,
    amount: action.amount,
    asset: action.asset,
    targetAsset: action.targetAsset,
    execution: action.totalExecutions + 1,
  });

  await updateAction(action.id, action.walletAddress, { action: 'confirm' });

  return 'executed';
}

export async function runScheduledActions(
  client: SuiJsonRpcClient,
): Promise<JobResult> {
  const actions = await fetchDueActions();
  if (actions.length === 0) {
    return { job: 'scheduled_actions', processed: 0, sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < actions.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = actions.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((action) => processAction(client, action)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'executed' || r.value === 'confirmation_sent') sent++;
        else if (r.value === 'error') errors++;
      } else {
        errors++;
      }
    }
  }

  return { job: 'scheduled_actions', processed: actions.length, sent, errors };
}
