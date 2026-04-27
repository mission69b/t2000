import type { NotificationUser } from './types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch eligible users from the audric internal API. Pure plumbing — the only
 * way the t2000 server (separate DB) can reach the audric DB to learn which
 * users to iterate.
 *
 * No timezone filtering — silent-infra crons run on fixed UTC hours and the
 * jobs themselves are idempotent.
 *
 * Reliability: retries up to MAX_ATTEMPTS on 5xx / network errors with
 * incremental backoff. Throws on persistent failure so `runCron` exits 1
 * and the ECS task is reported as FAILED in EventBridge / CloudWatch — this
 * replaces the previous silent `return []` which masked Audric/Neon
 * cold-start outages as "0 eligible users" and dropped a full day of
 * snapshots without any alarm. (Two real-world misses observed at
 * 2026-04-21 07:00 UTC and 2026-04-24 07:00 UTC.)
 *
 * An empty `users` array in a 200 response is still a legitimate state
 * (source-filtered queries can legitimately return zero eligible users) so
 * we don't treat it as an error.
 *
 * [SIMPLIFICATION DAY 5 — audit catch-up] Companion `reportNotifications`
 * was removed when the NotificationLog table + /api/internal/notification-log
 * endpoint were dropped. There is no notification audit log anymore — sent
 * counts are logged to stdout from `cron/index.ts` instead.
 */
export async function fetchNotificationUsers(): Promise<NotificationUser[]> {
  const url = `${getInternalUrl()}/api/internal/notification-users`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-internal-key': getInternalKey(),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        const data = (await res.json()) as { users?: NotificationUser[] };
        return data.users ?? [];
      }

      lastError = new Error(`HTTP ${res.status}`);
      if (attempt < MAX_ATTEMPTS) {
        const backoff = BASE_BACKOFF_MS * attempt;
        console.warn(
          `[cron] notification-users returned ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${backoff}ms`,
        );
        await sleep(backoff);
        continue;
      }
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        const backoff = BASE_BACKOFF_MS * attempt;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[cron] notification-users error (attempt ${attempt}/${MAX_ATTEMPTS}): ${msg} — retrying in ${backoff}ms`,
        );
        await sleep(backoff);
        continue;
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `notification-users fetch failed after ${MAX_ATTEMPTS} attempts: ${reason}`,
  );
}
