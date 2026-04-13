/**
 * Circuit breaker for autonomous actions.
 * After 3 consecutive failures within 14 days, auto-pause the action and notify.
 */

const MAX_CONSECUTIVE_FAILURES = 3;

interface ExecutionRecord {
  id: string;
  status: string;
  executedAt: string;
  skipReason?: string | null;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

export async function checkCircuitBreaker(actionId: string): Promise<{ tripped: boolean; consecutiveFailures: number }> {
  try {
    const res = await fetch(
      `${getInternalUrl()}/api/internal/autonomous-execution?actionId=${actionId}&limit=10`,
      { headers: { 'x-internal-key': getInternalKey() } },
    );

    if (!res.ok) return { tripped: false, consecutiveFailures: 0 };

    const data = (await res.json()) as { executions: ExecutionRecord[] };
    const executions = data.executions ?? [];

    if (executions.length === 0) return { tripped: false, consecutiveFailures: 0 };

    const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
    const recent = executions.filter((e) => new Date(e.executedAt).getTime() > fourteenDaysAgo);

    let consecutiveFailures = 0;
    for (const e of recent) {
      if (e.status === 'failed') {
        consecutiveFailures++;
      } else if (e.status === 'success') {
        break;
      }
    }

    return {
      tripped: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
      consecutiveFailures,
    };
  } catch {
    return { tripped: false, consecutiveFailures: 0 };
  }
}

export async function pauseAction(actionId: string, walletAddress: string): Promise<void> {
  try {
    await fetch(`${getInternalUrl()}/api/scheduled-actions/${actionId}`, {
      method: 'PATCH',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: walletAddress, action: 'pause_pattern' }),
    });
  } catch { /* best effort */ }
}
