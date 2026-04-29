import { runPortfolioSnapshots } from './jobs/portfolioSnapshots.js';
import { runProfileInference } from './jobs/profileInference.js';
import { runMemoryExtraction } from './jobs/memoryExtraction.js';
import { runChainMemory } from './jobs/chainMemory.js';
import { runFinancialContextSnapshot } from './jobs/financialContextSnapshot.js';
import { fetchNotificationUsers } from './scheduler.js';
import type { JobResult } from './types.js';

// [SIMPLIFICATION DAY 5] Folded S.6: deleted all user-facing cron jobs
// (hfAlerts, briefings, rateAlerts, onboardingFollowup, weeklyBriefing,
// autoCompound, scheduledActions, copilotExpiry, copilotDetectors,
// copilotDigest, scheduledReminders, outcomeChecker, anomalyDetector,
// followUpDelivery, patternDetector, autonomy-safety, circuit-breaker).
// Their backing tables (DailyBriefing, CopilotSuggestion, ScheduledAction,
// OutcomeCheck, FollowUpQueue, NotificationPrefs, NotificationLog) are gone
// too. The Audric chat surface is the product now — agent context comes from
// the four silent-infra jobs below.
//
// [S.31 — 2026-04-29] Critical HF email pipeline removed (hfHook.ts +
// /api/internal/hf-alert + AUDRIC_INTERNAL_* secrets on indexer task def).
// Stablecoin-only collateral (USDC + USDsui) + no leverage trading +
// zkLogin tap-to-confirm makes proactive HF email net-negative UX vs
// surfacing HF prominently in chat. /api/internal/health-factor (read API)
// was preserved.
//
// [Audit catch-up] reportNotifications() removed — its backing
// /api/internal/notification-log endpoint and NotificationLog table are gone.
// /api/internal/notification-users WAS preserved (silent-infra plumbing).

// [SIMPLIFICATION DAY 12.5] Collapsed CRON_GROUP control surface — the
// hourly + daily-chain EventBridge schedules + their ECS task definitions
// were deleted from AWS once their bodies became no-ops. Only daily-intel
// runs in production now; we keep the env override for local re-runs.
const CRON_GROUP = process.env.CRON_GROUP ?? 'daily-intel';

const HOUR_DATA = 7; // midnight US East
const HOUR_INTELLIGENCE = 19; // 2pm US East
// [v1.4.2 — Day 5 / Spec Item 6] Daily orientation snapshot. Spec-mandated
// 02:00 UTC. That's 19h *after* the prior calendar day's `HOUR_DATA` (07
// UTC) portfolio-snapshot, so the freshest PortfolioSnapshot row for every
// active user is in place when fin_ctx derives savings/debt/wallet deltas
// from it. Single hour, single fan-out via the audric internal API.
const HOUR_FIN_CTX = 2;

async function runCron(): Promise<void> {
  const startTime = Date.now();
  const utcHour = process.env.CRON_OVERRIDE_HOUR
    ? parseInt(process.env.CRON_OVERRIDE_HOUR, 10)
    : new Date().getUTCHours();

  console.log(`[cron] Starting group=${CRON_GROUP} UTC hour ${utcHour}`);

  const users = await fetchNotificationUsers();
  if (users.length === 0) {
    console.log('[cron] No users found — exiting');
    return;
  }

  console.log(`[cron] Processing ${users.length} users`);
  const results: JobResult[] = [];

  if (CRON_GROUP === 'daily-intel') {
    if (utcHour === HOUR_DATA) {
      results.push(await runPortfolioSnapshots());
      results.push(await runChainMemory());
    }

    if (utcHour === HOUR_INTELLIGENCE) {
      results.push(await runProfileInference());
      results.push(await runMemoryExtraction());
    }

    if (utcHour === HOUR_FIN_CTX) {
      results.push(await runFinancialContextSnapshot());
    }
  } else {
    console.log(`[cron] Unknown group "${CRON_GROUP}" — exiting`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  console.log(`[cron] Completed in ${elapsed}s — ${totalSent} sent, ${totalErrors} errors`);
  for (const r of results) {
    if (r.sent > 0 || r.errors > 0) {
      console.log(`[cron]   ${r.job}: ${r.processed} processed, ${r.sent} sent, ${r.errors} errors`);
    }
    // Structured JSON line for CloudWatch metric filters. Filter pattern:
    //   { $.kind = "metric" && $.name = "cron.*" }
    console.log(
      JSON.stringify({
        kind: 'metric',
        name: `cron.${r.job.replace(/-/g, '_')}`,
        processed: r.processed,
        sent: r.sent,
        errors: r.errors,
        elapsed_ms: Date.now() - startTime,
      }),
    );
  }
}

runCron()
  .then(() => {
    console.log('[cron] Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[cron] Fatal error:', err);
    process.exit(1);
  });
