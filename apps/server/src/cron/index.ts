import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { fetchNotificationUsers, reportNotifications } from './scheduler.js';
import { runHFAlerts } from './jobs/hfAlerts.js';
import { runBriefings } from './jobs/briefings.js';
import { runRateAlerts } from './jobs/rateAlerts.js';
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

  // --- Future daily jobs ---
  if (utcHour === BRIEFING_UTC_HOUR) {
    // TODO: Phase 3.1 — runAutoCompound(client, users)
    // TODO: Phase 2.2 — runInvoiceChecks(client, users)
    // TODO: Phase 3.5 — runGiftingReminders(client, users)
  }

  // --- Per-schedule jobs (check nextRunAt) ---
  // TODO: Phase 3.3 — runScheduledActions(client)

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
