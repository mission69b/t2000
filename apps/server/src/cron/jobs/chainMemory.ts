import type { JobResult } from '../types.js';

const CONCURRENCY = 5;

interface ChainMemoryUser {
  userId: string;
}

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

async function fetchEligibleUsers(): Promise<ChainMemoryUser[]> {
  const url = `${getInternalUrl()}/api/internal/notification-users?source=chain-memory`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[chain-memory] Failed to fetch users: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { users: ChainMemoryUser[] };
    return data.users ?? [];
  } catch (err) {
    console.error('[chain-memory] Error fetching users:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function extractChainMemory(userId: string): Promise<boolean> {
  const url = `${getInternalUrl()}/api/internal/chain-memory`;

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
      console.error(`[chain-memory] Failed for ${userId}: ${res.status} ${text}`);
      return false;
    }

    const result = (await res.json()) as { skipped?: boolean; reason?: string; extracted?: number };
    if (result.skipped) {
      console.log(`[chain-memory] Skipped ${userId}: ${result.reason}`);
      return true;
    }

    console.log(`[chain-memory] Extracted ${result.extracted} facts for ${userId}`);
    return true;
  } catch (err) {
    console.error(`[chain-memory] Error for ${userId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function runChainMemory(): Promise<JobResult> {
  const users = await fetchEligibleUsers();

  if (users.length === 0) {
    return { job: 'chain-memory', processed: 0, sent: 0, errors: 0 };
  }

  console.log(`[chain-memory] Processing ${users.length} users`);

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((u) => extractChainMemory(u.userId)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) sent++;
      else errors++;
    }
  }

  return { job: 'chain-memory', processed: users.length, sent, errors };
}
