import type { JobResult } from '../types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

/**
 * Calls the Audric internal API to snapshot all active user portfolios.
 * Runs daily alongside briefings.
 */
export async function runPortfolioSnapshots(): Promise<JobResult> {
  const job = 'portfolio-snapshot';
  const url = `${getInternalUrl()}/api/internal/portfolio-snapshot`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[cron] ${job}: HTTP ${res.status}`);
      return { job, processed: 0, sent: 0, errors: 1 };
    }

    const data = (await res.json()) as { created: number; skipped: number; errors: number; total: number };
    console.log(`[cron] ${job}: ${data.created} created, ${data.skipped} skipped, ${data.errors} errors out of ${data.total} users`);

    return {
      job,
      processed: data.total,
      sent: data.created,
      errors: data.errors,
    };
  } catch (err) {
    console.error(`[cron] ${job}: Error:`, err instanceof Error ? err.message : err);
    return { job, processed: 0, sent: 0, errors: 1 };
  }
}
