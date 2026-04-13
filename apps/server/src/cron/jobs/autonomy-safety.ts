/**
 * Safety checks for autonomous action execution.
 * Called before executing any Stage 2+ behavior-detected action.
 */

const DEFAULT_DAILY_LIMIT = 200;

export interface SafetyContext {
  walletAddress: string;
  actionType: string;
  amount: number;
  asset: string;
  stage: number;
}

export interface SafetyResult {
  safe: boolean;
  reason?: string;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function fetchBalanceForAsset(walletAddress: string, asset: string): Promise<{ balance: number; ok: boolean }> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/wallet-balance?address=${walletAddress}&asset=${asset}`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return { balance: 0, ok: false };
    const data = (await res.json()) as { balance?: number };
    return { balance: data.balance ?? 0, ok: true };
  } catch {
    return { balance: 0, ok: false };
  }
}

async function fetchHealthFactor(walletAddress: string): Promise<number | null> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/health-factor?address=${walletAddress}`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { healthFactor?: number };
    return data.healthFactor ?? null;
  } catch {
    return null;
  }
}

async function fetchDailyAutonomousSpend(walletAddress: string): Promise<{ totalUsd: number; ok: boolean }> {
  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/autonomous-spend?address=${walletAddress}`, {
      headers: { 'x-internal-key': getInternalKey() },
    });
    if (!res.ok) return { totalUsd: 0, ok: false };
    const data = (await res.json()) as { totalUsd?: number };
    return { totalUsd: data.totalUsd ?? 0, ok: true };
  } catch {
    return { totalUsd: 0, ok: false };
  }
}

export async function runAutonomySafetyChecks(ctx: SafetyContext): Promise<SafetyResult> {
  // 1. Never auto-borrow (no API call needed)
  if (ctx.actionType === 'borrow') {
    return { safe: false, reason: 'borrow_forbidden: autonomous borrows are not allowed' };
  }

  // 2. Sufficient balance (fail closed: API failure blocks execution)
  const balanceResult = await fetchBalanceForAsset(ctx.walletAddress, ctx.asset);
  if (!balanceResult.ok) {
    return { safe: false, reason: 'balance_check_unavailable: cannot verify balance' };
  }
  if (balanceResult.balance < ctx.amount) {
    return {
      safe: false,
      reason: `insufficient_balance: need $${ctx.amount} ${ctx.asset}, have $${balanceResult.balance.toFixed(2)}`,
    };
  }

  // 3. Health factor gate (only for save/repay actions that affect positions)
  if (ctx.actionType === 'save' || ctx.actionType === 'repay') {
    const hf = await fetchHealthFactor(ctx.walletAddress);
    if (hf !== null && hf > 0 && hf < 1.8) {
      return {
        safe: false,
        reason: `health_factor_low: HF=${hf.toFixed(2)} (minimum 1.8 for autonomous actions)`,
      };
    }
  }

  // 4. Daily autonomous limit (fail closed: API failure blocks execution)
  const spendResult = await fetchDailyAutonomousSpend(ctx.walletAddress);
  if (!spendResult.ok) {
    return { safe: false, reason: 'spend_check_unavailable: cannot verify daily spend' };
  }
  if (spendResult.totalUsd + ctx.amount > DEFAULT_DAILY_LIMIT) {
    return {
      safe: false,
      reason: `daily_limit_exceeded: $${spendResult.totalUsd.toFixed(2)} spent today + $${ctx.amount} exceeds $${DEFAULT_DAILY_LIMIT} limit`,
    };
  }

  return { safe: true };
}
