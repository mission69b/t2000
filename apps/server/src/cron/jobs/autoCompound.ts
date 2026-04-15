import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getPendingRewards, buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { executeAdminTx } from '../../services/sui-executor.js';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 10;
const BATCH_DELAY_MS = 100;
const FEATURE_KEY = 'auto_compound';
const MIN_REWARD_VALUE_USD = 0.10;
const COMPOUND_CHARGE = 5000n; // $0.005 USDC (6 decimals)

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
  } catch {
    // best effort
  }
}

type ProcessResult = 'sent' | 'skipped' | 'error';

async function processUser(
  client: SuiJsonRpcClient,
  user: NotificationUser,
): Promise<ProcessResult> {
  try {
    if (!user.allowanceId) return 'skipped';

    const rewards = await withRetry(() => getPendingRewards(client, user.walletAddress));
    const nonTrivial = rewards.filter((r) => r.amount > 0);
    if (nonTrivial.length === 0) return 'skipped';

    const totalEstUsd = nonTrivial.reduce((s, r) => s + r.estimatedValueUsd, 0);

    try {
      const tx = buildDeductAllowanceTx(user.allowanceId, COMPOUND_CHARGE, ALLOWANCE_FEATURES.AUTO_COMPOUND);
      const result = await withRetry(() => executeAdminTx(tx));
      if (result.status !== 'success') {
        console.warn(`[auto-compound] Charge failed for ${user.walletAddress}: ${result.digest}`);
        return 'skipped';
      }
    } catch (err) {
      console.warn(`[auto-compound] Charge error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
      return 'skipped';
    }

    const rewardSummary = rewards
      .filter((r) => r.amount > 0)
      .map((r) => `${r.amount.toFixed(4)} ${r.symbol}`)
      .join(', ');

    await storeAppEvent(user.walletAddress, 'compound_available', 'Rewards ready to compound', {
      rewards: rewards.filter((r) => r.amount > 0).map((r) => ({
        symbol: r.symbol,
        coinType: r.coinType,
        amount: r.amount,
        estimatedValueUsd: r.estimatedValueUsd,
      })),
      totalEstimatedUsd: totalEstUsd,
      rewardSummary,
    });

    return 'sent';
  } catch (err) {
    console.error(`[auto-compound] Error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

export async function runAutoCompound(
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

  return { job: 'auto_compound', processed: eligible.length, sent, errors };
}
