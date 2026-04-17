import type { JobResult } from '../types.js';

/**
 * Audric Copilot — daily email digest tick.
 *
 * Hourly cron job that pings the audric internal `/api/internal/copilot/digest-tick`
 * endpoint. Audric handles the per-user logic:
 *   - filter by digestEnabled + emailDeliverable + emailVerified
 *   - match the user's local hour against their digestSendHourLocal preference
 *   - 23h dedup window so re-firing within the same window is a no-op
 *   - skip users with zero pending Copilot suggestions
 *
 * The job stays a thin orchestrator so the heavy lifting lives next to the
 * Resend client and Prisma in audric.
 *
 * No-ops when COPILOT_ENABLED=false (audric returns 404).
 *
 * See audric-copilot-smart-confirmations.plan.md §10 (Wave C.3).
 */

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface DigestResponse {
  ok: boolean;
  evaluated?: number;
  sent?: number;
  skippedNoPending?: number;
  skippedHourMismatch?: number;
  errors?: number;
  error?: string;
}

export async function runCopilotDigest(): Promise<JobResult> {
  if (process.env.COPILOT_ENABLED !== 'true' && process.env.COPILOT_ENABLED !== '1') {
    return { job: 'copilot_digest', processed: 0, sent: 0, errors: 0 };
  }

  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/copilot/digest-tick`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 404) {
      return { job: 'copilot_digest', processed: 0, sent: 0, errors: 0 };
    }

    if (!res.ok) {
      console.warn(`[copilot-digest] HTTP ${res.status}`);
      return { job: 'copilot_digest', processed: 0, sent: 0, errors: 1 };
    }

    const data = (await res.json()) as DigestResponse;
    const evaluated = data.evaluated ?? 0;
    const sent = data.sent ?? 0;
    const errors = data.errors ?? 0;

    if (sent > 0 || errors > 0) {
      console.log(
        `[copilot-digest] evaluated=${evaluated} sent=${sent} ` +
        `skippedHour=${data.skippedHourMismatch ?? 0} ` +
        `skippedEmpty=${data.skippedNoPending ?? 0} errors=${errors}`,
      );
    }

    return {
      job: 'copilot_digest',
      processed: evaluated,
      sent,
      errors,
    };
  } catch (err) {
    console.error('[copilot-digest] Error:', err instanceof Error ? err.message : err);
    return { job: 'copilot_digest', processed: 0, sent: 0, errors: 1 };
  }
}
