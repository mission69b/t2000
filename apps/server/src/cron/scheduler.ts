import type { NotificationUser } from './types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

/**
 * Fetch eligible users from the audric internal API. Pure plumbing — the only
 * way the t2000 server (separate DB) can reach the audric DB to learn which
 * users to iterate.
 *
 * No timezone filtering — silent-infra crons run on fixed UTC hours and the
 * jobs themselves are idempotent.
 *
 * [SIMPLIFICATION DAY 5 — audit catch-up] Companion `reportNotifications`
 * was removed when the NotificationLog table + /api/internal/notification-log
 * endpoint were dropped. There is no notification audit log anymore — sent
 * counts are logged to stdout from `cron/index.ts` instead.
 */
export async function fetchNotificationUsers(): Promise<NotificationUser[]> {
  const url = `${getInternalUrl()}/api/internal/notification-users`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[cron] Failed to fetch notification users: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { users: NotificationUser[] };
    return data.users ?? [];
  } catch (err) {
    console.error('[cron] Error fetching notification users:', err instanceof Error ? err.message : err);
    return [];
  }
}
