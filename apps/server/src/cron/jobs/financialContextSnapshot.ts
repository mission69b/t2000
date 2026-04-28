import type { JobResult } from '../types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

/**
 * [PR 3 — scaling spec] Daily snapshot of every active user's orientation
 * block. Fan-out is now sharded: N parallel POSTs to
 * `/api/internal/financial-context-snapshot?shard=i&total=N` so each
 * shard handles `~(activeUsers / N)` users and finishes well within
 * Vercel's `maxDuration` budget.
 *
 * Shard count is tunable via `T2000_FIN_CTX_SHARD_COUNT` (default 8 —
 * matches the typical Vercel concurrent-invocation cap). At 1k active users
 * each shard handles ~125 users × 1.5s = ~3 min, comfortably under the
 * 5-minute `maxDuration` with room to spare.
 *
 * Rollback: set `T2000_FIN_CTX_SHARD_COUNT=1` to revert to single-shard
 * (original) behavior.
 */
export async function runFinancialContextSnapshot(): Promise<JobResult> {
  const job = 'financial-context-snapshot';
  const baseUrl = `${getInternalUrl()}/api/internal/financial-context-snapshot`;
  const internalKey = getInternalKey();

  const total = Math.max(
    1,
    parseInt(process.env.T2000_FIN_CTX_SHARD_COUNT ?? '8', 10) || 8,
  );

  const shardPromises = Array.from({ length: total }, (_, shard) =>
    fetch(`${baseUrl}?shard=${shard}&total=${total}`, {
      method: 'POST',
      headers: {
        'x-internal-key': internalKey,
        'Content-Type': 'application/json',
      },
    }).then(async (res) => {
      if (!res.ok) {
        console.error(`[cron] ${job}: shard ${shard}/${total} HTTP ${res.status}`);
        return { created: 0, skipped: 0, errors: 1, total: 0 };
      }
      return res.json() as Promise<{ created: number; skipped: number; errors: number; total: number }>;
    }).catch((err: unknown) => {
      console.error(`[cron] ${job}: shard ${shard}/${total} error:`, err instanceof Error ? err.message : err);
      return { created: 0, skipped: 0, errors: 1, total: 0 };
    }),
  );

  const results = await Promise.allSettled(shardPromises);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let total_users = 0;

  for (const result of results) {
    const data = result.status === 'fulfilled'
      ? result.value
      : { created: 0, skipped: 0, errors: 1, total: 0 };
    created += data.created;
    skipped += data.skipped;
    errors += data.errors;
    total_users += data.total;
  }

  console.log(
    `[cron] ${job}: ${total} shards — ${created} created, ${skipped} skipped, ${errors} errors out of ${total_users} active users`,
  );

  return {
    job,
    processed: total_users,
    sent: created,
    errors,
  };
}
