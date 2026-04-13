import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { fetchNotificationUsers, reportNotifications } from './scheduler.js';
import { runHFAlerts } from './jobs/hfAlerts.js';
import { runBriefings } from './jobs/briefings.js';
import { runRateAlerts } from './jobs/rateAlerts.js';
import { runOnboardingFollowup } from './jobs/onboardingFollowup.js';
import { runPortfolioSnapshots } from './jobs/portfolioSnapshots.js';
import { runWeeklyBriefing } from './jobs/weeklyBriefing.js';
import { runAutoCompound } from './jobs/autoCompound.js';
import { runScheduledActions } from './jobs/scheduledActions.js';
import { runScheduledReminders } from './jobs/scheduledReminders.js';
import { runOutcomeChecks } from './jobs/outcomeChecker.js';
import { detectAnomaliesJob } from './jobs/anomalyDetector.js';
import { deliverFollowUps } from './jobs/followUpDelivery.js';
import { runProfileInference } from './jobs/profileInference.js';
import { runMemoryExtraction } from './jobs/memoryExtraction.js';
import { runChainMemory } from './jobs/chainMemory.js';
import type { JobResult } from './types.js';

function getClient(): SuiJsonRpcClient {
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
  return new SuiJsonRpcClient({ url, network: 'mainnet' });
}

// Briefings fire once daily at this UTC hour (≈ 8am US East, 2pm UK, 8pm Thailand).
const BRIEFING_UTC_HOUR = 13;

async function runCron(): Promise<void> {
  const startTime = Date.now();
  const utcHour = process.env.CRON_OVERRIDE_HOUR
    ? parseInt(process.env.CRON_OVERRIDE_HOUR, 10)
    : new Date().getUTCHours();

  console.log(`[cron] Starting notification run for UTC hour ${utcHour}`);

  const users = await fetchNotificationUsers();
  if (users.length === 0) {
    console.log('[cron] No users found — exiting');
    return;
  }

  console.log(`[cron] Processing ${users.length} users`);
  const client = getClient();
  const results: JobResult[] = [];

  // --- Hourly jobs (every run) ---
  results.push(await runHFAlerts(client, users));
  results.push(await runRateAlerts(client, users));

  // --- Daily briefings (fixed UTC hour only) ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runBriefings(client, users));
  }

  // --- Daily onboarding follow-up (24h after sign-up) ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runOnboardingFollowup(client));
  }

  // --- Daily portfolio snapshots ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runPortfolioSnapshots());
  }

  // --- Weekly briefing (Sundays at briefing hour) ---
  const dayOfWeek = new Date().getUTCDay();
  if (utcHour === BRIEFING_UTC_HOUR && dayOfWeek === 0) {
    results.push(await runWeeklyBriefing(client, users));
  }

  // --- Daily auto-compound check ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runAutoCompound(client, users));
    // TODO: Phase 2.2 — runInvoiceChecks(client, users)
  }

  // --- Per-schedule jobs (check nextRunAt) ---
  results.push(await runScheduledActions(client));

  // --- Scheduled action reminders (at briefing hour) ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runScheduledReminders(client, users));
  }

  // --- Feedback loop: outcome checks, anomaly detection, follow-up delivery ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runOutcomeChecks(client));
    results.push(await detectAnomaliesJob(client, users));
    results.push(await deliverFollowUps(client));
  }

  // --- Intelligence layer: profile inference + memory extraction + chain memory ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    results.push(await runProfileInference());
    results.push(await runMemoryExtraction());
    results.push(await runChainMemory());
  }

  await reportNotifications(results);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  console.log(`[cron] Completed in ${elapsed}s — ${totalSent} sent, ${totalErrors} errors`);
  for (const r of results) {
    if (r.sent > 0 || r.errors > 0) {
      console.log(`[cron]   ${r.job}: ${r.processed} processed, ${r.sent} sent, ${r.errors} errors`);
    }
  }
}

// Entry point — run once and exit (ECS scheduled task)
runCron()
  .then(() => {
    console.log('[cron] Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[cron] Fatal error:', err);
    process.exit(1);
  });
