import type { JobResult } from '../types.js';

/**
 * Audric Copilot — expiry sweep.
 *
 * Hourly cron job that calls the audric internal API to mark suggestions past
 * their expiresAt as 'expired'. Covers both ScheduledAction (Journey A) and
 * CopilotSuggestion (Journeys B/C/D + HF) tables in one round-trip.
 *
 * No-ops when COPILOT_ENABLED=false (audric returns 404).
 *
 * See audric-copilot-smart-confirmations.plan.md §10.
 */

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface ExpireResponse {
  ok: boolean;
  expired?: {
    scheduledActions: number;
    copilotSuggestions: number;
  };
  error?: string;
}

export async function runCopilotExpiry(): Promise<JobResult> {
  // Light early-out so the cron doesn't even hit the network when Copilot is
  // off on the t2000 side. The audric side double-gates anyway.
  if (process.env.COPILOT_ENABLED !== 'true' && process.env.COPILOT_ENABLED !== '1') {
    return { job: 'copilot_expiry', processed: 0, sent: 0, errors: 0 };
  }

  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/copilot/expire-due`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 404) {
      // audric has Copilot disabled — nothing to do, not an error
      return { job: 'copilot_expiry', processed: 0, sent: 0, errors: 0 };
    }

    if (!res.ok) {
      console.warn(`[copilot-expiry] HTTP ${res.status}`);
      return { job: 'copilot_expiry', processed: 0, sent: 0, errors: 1 };
    }

    const data = (await res.json()) as ExpireResponse;
    const expired = (data.expired?.scheduledActions ?? 0) + (data.expired?.copilotSuggestions ?? 0);

    if (expired > 0) {
      console.log(`[copilot-expiry] Marked ${expired} suggestions expired`);
    }

    return {
      job: 'copilot_expiry',
      processed: expired,
      sent: expired,
      errors: 0,
    };
  } catch (err) {
    console.error('[copilot-expiry] Error:', err instanceof Error ? err.message : err);
    return { job: 'copilot_expiry', processed: 0, sent: 0, errors: 1 };
  }
}
