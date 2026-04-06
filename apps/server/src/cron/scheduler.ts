import type { NotificationUser, JobResult } from './types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

/**
 * Fetch users eligible for notifications at the given UTC hour.
 * Calls the audric app's internal API which queries its own NeonDB
 * for users whose timezoneOffset maps to 8am at this UTC hour.
 */
export async function fetchNotificationUsers(utcHour: number): Promise<NotificationUser[]> {
  const url = `${getInternalUrl()}/api/internal/notification-users?hour=${utcHour}`;

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

/**
 * Report sent notifications back to audric for dedup + audit.
 */
export async function reportNotifications(results: JobResult[]): Promise<void> {
  const url = `${getInternalUrl()}/api/internal/notification-log`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ results, reportedAt: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('[cron] Error reporting notifications:', err instanceof Error ? err.message : err);
  }
}
