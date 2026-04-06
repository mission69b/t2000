import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { NotificationUser, JobResult } from '../types.js';

const FEATURE_KEY = 'rate_alert';

/**
 * USDC rate monitoring alerts — stub.
 * Full implementation in Phase 3.2.
 * Compares current NAVI USDC supply rate against last notified rate,
 * alerts on ±1% change. Max one alert per 24 hours per user.
 */
export async function runRateAlerts(
  _client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const eligible = users.filter((u) => u.prefs[FEATURE_KEY] !== false);

  // TODO: Phase 3.2 — fetch NAVI USDC rate, compare to stored lastNotifiedRate,
  // send alert if delta > 1%, respect 24h dedup

  return { job: 'rate_alerts', processed: eligible.length, sent: 0, errors: 0 };
}
