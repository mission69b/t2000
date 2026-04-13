import type { JobResult } from '../types.js';

const CONCURRENCY = 5;

interface PatternUser {
  userId: string;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function fetchEligibleUsers(): Promise<PatternUser[]> {
  const url = `${getInternalUrl()}/api/internal/notification-users?source=pattern-detection`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[pattern-detector] Failed to fetch users: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { users: PatternUser[] };
    return data.users ?? [];
  } catch (err) {
    console.error('[pattern-detector] Error fetching users:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function detectPatterns(userId: string): Promise<boolean> {
  const url = `${getInternalUrl()}/api/internal/pattern-detection`;

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
      console.error(`[pattern-detector] Failed for ${userId}: ${res.status} ${text}`);
      return false;
    }

    const result = (await res.json()) as { detected?: number; reason?: string };
    if (result.detected === 0) {
      console.log(`[pattern-detector] No patterns for ${userId}: ${result.reason}`);
    } else {
      console.log(`[pattern-detector] Detected ${result.detected} patterns for ${userId}`);
    }
    return true;
  } catch (err) {
    console.error(`[pattern-detector] Error for ${userId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function runPatternDetector(): Promise<JobResult> {
  const users = await fetchEligibleUsers();

  if (users.length === 0) {
    return { job: 'pattern_detector', processed: 0, sent: 0, errors: 0 };
  }

  console.log(`[pattern-detector] Processing ${users.length} users`);

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((u) => detectPatterns(u.userId)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) sent++;
      else errors++;
    }
  }

  return { job: 'pattern_detector', processed: users.length, sent, errors };
}
