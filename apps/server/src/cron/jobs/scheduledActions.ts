import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { executeAdminTx } from '../../services/sui-executor.js';
import type { JobResult } from '../types.js';

const CONCURRENCY = 5;
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
    if (!action.allowanceId) {
      console.warn(`[scheduled-actions] No allowance for ${action.walletAddress}, skipping`);
      return 'skipped';
    }

    // Trust ladder: not yet autonomous — send confirmation card and advance nextRunAt
    // to prevent re-emitting every hour
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

    // Autonomous — charge allowance and notify for client-side execution
    try {
      const tx = buildDeductAllowanceTx(action.allowanceId, DCA_CHARGE, ALLOWANCE_FEATURES.DCA);
      const result = await executeAdminTx(tx);
      if (result.status !== 'success') {
        console.warn(`[scheduled-actions] Charge failed for ${action.walletAddress}: ${result.digest}`);
        return 'skipped';
      }
    } catch (err) {
      console.warn(`[scheduled-actions] Charge error for ${action.walletAddress}:`, err instanceof Error ? err.message : err);
      return 'skipped';
    }

    // Store execution event — client picks this up for the actual on-chain tx
    await storeAppEvent(action.walletAddress, 'schedule_execute', `Auto-${action.actionType} $${action.amount.toFixed(2)}`, {
      actionId: action.id,
      actionType: action.actionType,
      amount: action.amount,
      asset: action.asset,
      targetAsset: action.targetAsset,
      execution: action.totalExecutions + 1,
    });

    // Advance nextRunAt
    await updateAction(action.id, action.walletAddress, { action: 'confirm' });

    return 'executed';
  } catch (err) {
    console.error(`[scheduled-actions] Error for action ${action.id}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
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
