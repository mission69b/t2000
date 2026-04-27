import type { JobResult } from '../types.js';

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

/**
 * [v1.4.2 — Day 5 / Spec Item 6] Daily snapshot of every active user's
 * orientation block. Calls the audric internal API which writes one
 * `UserFinancialContext` row per user (upsert). The row powers the
 * `<financial_context>` system-prompt section every time `createEngine`
 * boots for that user.
 *
 * Single endpoint (mirrors `portfolio-snapshot`) — the audric side
 * iterates users itself; this thin shell just triggers + reports
 * aggregate counts. Runs after `portfolio-snapshot` in the same UTC
 * hour so the freshest portfolio numbers feed the financial-context
 * deltas.
 */
export async function runFinancialContextSnapshot(): Promise<JobResult> {
  const job = 'financial-context-snapshot';
  const url = `${getInternalUrl()}/api/internal/financial-context-snapshot`;

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

    const data = (await res.json()) as {
      created: number;
      skipped: number;
      errors: number;
      total: number;
    };
    console.log(
      `[cron] ${job}: ${data.created} created, ${data.skipped} skipped, ${data.errors} errors out of ${data.total} active users`,
    );

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
