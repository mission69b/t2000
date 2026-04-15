import type { JobResult } from '../types.js';
import { sleep } from '../utils.js';

const CONCURRENCY = 10;
const BATCH_DELAY_MS = 100;

interface InferenceUser {
  userId: string;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function fetchEligibleUsers(): Promise<InferenceUser[]> {
  const url = `${getInternalUrl()}/api/internal/notification-users?source=profile-inference`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[profile-inference] Failed to fetch users: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { users: InferenceUser[] };
    return data.users ?? [];
  } catch (err) {
    console.error('[profile-inference] Error fetching users:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function inferProfile(userId: string): Promise<boolean> {
  const url = `${getInternalUrl()}/api/internal/profile-inference`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[profile-inference] Failed for ${userId}: ${res.status} ${text}`);
      return false;
    }

    const result = (await res.json()) as { skipped?: boolean; reason?: string; fields?: string[] };
    if (result.skipped) {
      console.log(`[profile-inference] Skipped ${userId}: ${result.reason}`);
      return true;
    }

    console.log(`[profile-inference] Updated ${userId}: ${result.fields?.join(', ')}`);
    return true;
  } catch (err) {
    console.error(`[profile-inference] Error for ${userId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function runProfileInference(): Promise<JobResult> {
  const users = await fetchEligibleUsers();

  if (users.length === 0) {
    return { job: 'profile-inference', processed: 0, sent: 0, errors: 0 };
  }

  console.log(`[profile-inference] Processing ${users.length} users`);

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((u) => inferProfile(u.userId)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) sent++;
      else errors++;
    }
  }

  return { job: 'profile-inference', processed: users.length, sent, errors };
}
