import type { JobResult } from '../types.js';

/**
 * Audric Copilot — detector trigger.
 *
 * Hourly cron job that pings the audric internal API to run threshold
 * detectors (idle_usdc, idle_sui) across active users and surface any new
 * `copilot_suggestion` rows. The audric side handles iteration, RPC fanout,
 * and per-(userId,type) 24h throttling so this cron stays a thin orchestrator.
 *
 * No-ops when COPILOT_ENABLED=false (audric returns 404).
 *
 * See audric-copilot-smart-confirmations.plan.md §10 (Wave C.2).
 */

function getInternalUrl(): string {
  return process.env.AUDRIC_INTERNAL_URL ?? 'https://audric.ai';
}

function getInternalKey(): string {
  return process.env.AUDRIC_INTERNAL_KEY ?? '';
}

interface DetectorResponse {
  ok: boolean;
  scanned?: number;
  surfaced?: number;
  throttled?: number;
  errors?: number;
  error?: string;
}

export async function runCopilotDetectors(): Promise<JobResult> {
  if (process.env.COPILOT_ENABLED !== 'true' && process.env.COPILOT_ENABLED !== '1') {
    return { job: 'copilot_detectors', processed: 0, sent: 0, errors: 0 };
  }

  try {
    const res = await fetch(`${getInternalUrl()}/api/internal/copilot/run-detectors`, {
      method: 'POST',
      headers: {
        'x-internal-key': getInternalKey(),
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 404) {
      // audric has Copilot disabled — no-op
      return { job: 'copilot_detectors', processed: 0, sent: 0, errors: 0 };
    }

    if (!res.ok) {
      console.warn(`[copilot-detectors] HTTP ${res.status}`);
      return { job: 'copilot_detectors', processed: 0, sent: 0, errors: 1 };
    }

    const data = (await res.json()) as DetectorResponse;
    const surfaced = data.surfaced ?? 0;
    const scanned = data.scanned ?? 0;
    const errors = data.errors ?? 0;

    if (surfaced > 0 || errors > 0) {
      console.log(
        `[copilot-detectors] scanned=${scanned} surfaced=${surfaced} ` +
        `throttled=${data.throttled ?? 0} errors=${errors}`,
      );
    }

    return {
      job: 'copilot_detectors',
      processed: scanned,
      sent: surfaced,
      errors,
    };
  } catch (err) {
    console.error('[copilot-detectors] Error:', err instanceof Error ? err.message : err);
    return { job: 'copilot_detectors', processed: 0, sent: 0, errors: 1 };
  }
}
