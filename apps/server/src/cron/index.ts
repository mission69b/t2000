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
import { runPatternDetector } from './jobs/patternDetector.js';
import type { JobResult } from './types.js';

function getClient(): SuiJsonRpcClient {
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
  return new SuiJsonRpcClient({ url, network: 'mainnet' });
}

// CRON_GROUP controls which jobs this task instance runs.
// "all" (default) = legacy single-task mode; split into groups for scale.
const CRON_GROUP = process.env.CRON_GROUP ?? 'all';

// Daily hour gates (only relevant for daily-chain and daily-intel groups)
const HOUR_DATA        = 7;  // midnight US East
const HOUR_COMPOUND    = 10; // 5am US East
const HOUR_BRIEFING    = 13; // 8am US East
const HOUR_INTELLIGENCE = 19; // 2pm US East

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
  const client = getClient();
  const results: JobResult[] = [];

  const run = (group: string) => CRON_GROUP === 'all' || CRON_GROUP === group;

  // --- Group: hourly (RPC-heavy, runs every hour) ---
  if (run('hourly')) {
    results.push(await runHFAlerts(client, users));
    results.push(await runRateAlerts(client, users));
    results.push(await runScheduledActions(client));
  }

  // --- Group: daily-chain (RPC-heavy, runs at specific hours) ---
  if (run('daily-chain')) {
    if (utcHour === HOUR_COMPOUND) {
      results.push(await runAutoCompound(client, users));
      results.push(await runOutcomeChecks(client));
      results.push(await detectAnomaliesJob(client, users));
      results.push(await deliverFollowUps(client));
    }

    if (utcHour === HOUR_BRIEFING) {
      results.push(await runBriefings(client, users));
      results.push(await runOnboardingFollowup(client));
      results.push(await runScheduledReminders(client, users));

      const dayOfWeek = new Date().getUTCDay();
      if (dayOfWeek === 0) {
        results.push(await runWeeklyBriefing(client, users));
      }
    }
  }

  // --- Group: daily-intel (API/LLM only, no Sui RPC) ---
  if (run('daily-intel')) {
    if (utcHour === HOUR_DATA) {
      results.push(await runPortfolioSnapshots());
      results.push(await runChainMemory());
      results.push(await runPatternDetector());
    }

    if (utcHour === HOUR_INTELLIGENCE) {
      results.push(await runProfileInference());
      results.push(await runMemoryExtraction());
    }
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
