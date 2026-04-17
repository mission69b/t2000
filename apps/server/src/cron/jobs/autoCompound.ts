import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getPendingRewards, buildDeductAllowanceTx, ALLOWANCE_FEATURES } from '@t2000/sdk';
import { executeAdminTx } from '../../services/sui-executor.js';
import type { NotificationUser, JobResult } from '../types.js';
import { sleep, withRetry } from '../utils.js';

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 2000;
const FEATURE_KEY = 'auto_compound';
const MIN_REWARD_VALUE_USD = 0.10;
const COMPOUND_CHARGE = 5000n; // $0.005 USDC (6 decimals)
const SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000; // Copilot: 24h from surface to act

// When true, accrued rewards surface as a Copilot `compound` suggestion on the
// dashboard instead of being charged + emitted as a `compound_available`
// AppEvent. The user confirms by signing the claim+resupply PTB themselves.
function isCopilotEnabled(): boolean {
  return process.env.COPILOT_ENABLED === 'true' || process.env.COPILOT_ENABLED === '1';
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface SurfaceResponse {
  ok: boolean;
  throttled?: boolean;
  reason?: string;
  id?: string;
  existingId?: string;
  existingStatus?: string;
}

async function surfaceCompoundSuggestion(
  walletAddress: string,
  payload: Record<string, unknown>,
): Promise<SurfaceResponse> {
  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_MS);
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/copilot/surface-suggestion`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'copilot_suggestion',
        address: walletAddress,
        type: 'compound',
        payload,
        expiresAt: expiresAt.toISOString(),
      }),
    });

    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }

    return (await res.json()) as SurfaceResponse;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
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
    const rewards = await withRetry(() => getPendingRewards(client, user.walletAddress));
    const nonTrivial = rewards.filter((r) => r.amount > 0);
    if (nonTrivial.length === 0) return 'skipped';

    const totalEstUsd = nonTrivial.reduce((s, r) => s + r.estimatedValueUsd, 0);
    if (totalEstUsd < MIN_REWARD_VALUE_USD) return 'skipped';

    const rewardSummary = nonTrivial
      .map((r) => `${r.amount.toFixed(4)} ${r.symbol}`)
      .join(', ');

    const rewardPayload = nonTrivial.map((r) => ({
      symbol: r.symbol,
      coinType: r.coinType,
      amount: r.amount,
      estimatedValueUsd: r.estimatedValueUsd,
    }));

    // Audric Copilot path — surface the compound opportunity as a one-shot
    // suggestion on the dashboard. The user signs the claim+resupply PTB
    // themselves at confirm time. No allowance fee is charged in this path
    // (it would be wrong UX to debit before the user has agreed to act).
    if (isCopilotEnabled()) {
      const surface = await surfaceCompoundSuggestion(user.walletAddress, {
        rewards: rewardPayload,
        totalEstimatedUsd: totalEstUsd,
        amountUsd: totalEstUsd, // confirm screen reads `amountUsd`
        rewardSummary,
      });

      if (!surface.ok) {
        console.warn(`[auto-compound] Copilot surface failed for ${user.walletAddress}: ${surface.reason}`);
        return 'error';
      }
      if (surface.throttled) {
        return 'skipped';
      }
      return 'sent';
    }

    // ─── Legacy (non-Copilot) path ───────────────────────────────────────────
    if (!user.allowanceId) return 'skipped';

    try {
      const aid = user.allowanceId;
      const result = await withRetry(() => {
        const tx = buildDeductAllowanceTx(aid, COMPOUND_CHARGE, ALLOWANCE_FEATURES.AUTO_COMPOUND);
        return executeAdminTx(tx);
      });
      if (result.status !== 'success') {
        console.warn(`[auto-compound] Charge failed for ${user.walletAddress}: ${result.digest}`);
        return 'skipped';
      }
    } catch (err) {
      console.warn(`[auto-compound] Charge error for ${user.walletAddress}:`, err instanceof Error ? err.message : err);
      return 'skipped';
    }

    await storeAppEvent(user.walletAddress, 'compound_available', 'Rewards ready to compound', {
      rewards: rewardPayload,
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
