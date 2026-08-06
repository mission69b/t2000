import {
  assertLimitConfig,
  dailySpentToday,
  getLimits,
  LimitExceededError,
  recordDailySpend,
} from '@t2000/sdk';

// Spending limits on the sponsored escrow paths (S.930 C, S.930.1 C).
//
// `send` / `swap` / `pay` inherit the gate from the SDK write path. The job
// and open-board verbs do not: they go out through the sponsored rail, so
// until this existed a $25 cap did not stop a hire and a completed hire left
// "spent today" reading $0.00.
//
// Shared by `job.ts` and `open.ts` so the two can't drift — the interesting
// part is WHICH verbs pass an amount, and that decision should be made once.

/** The shared limit error offers `--force`; the job/open verbs don't have it. */
const FORCE_HINT_RE = /\s*Use --force[^.]*\.\s*$/;

/**
 * Assert before the money moves. Throws with guidance that points at a door
 * that actually exists.
 */
export function assertSpendAllowed(amountUsdc: number, force?: boolean): void {
  if (!(Number.isFinite(amountUsdc) && amountUsdc > 0)) {
    return;
  }
  try {
    assertLimitConfig({
      limits: getLimits(),
      spentTodayUsd: dailySpentToday(),
      operation: 'send',
      amountUsd: amountUsdc,
      force,
    });
  } catch (e) {
    if (e instanceof LimitExceededError) {
      throw new Error(
        `${e.message.replace(FORCE_HINT_RE, '')} Raise the cap with \`t2 limit set\` — job verbs have no --force.`,
      );
    }
    throw e;
  }
}

/**
 * Record after the money actually moved. `digest` is the proof — a failed
 * verb must not eat the day's cap.
 */
export function recordSpendIfLanded(
  amountUsdc: number,
  digest: string | undefined,
): void {
  if (digest && Number.isFinite(amountUsdc) && amountUsdc > 0) {
    recordDailySpend(amountUsdc);
  }
}
