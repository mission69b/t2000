import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { NotificationUser, JobResult } from '../types.js';

const FEATURE_KEY = 'briefing';

/**
 * Morning briefing job — stub.
 * Full implementation in Phase 1 Week 2 (needs allowance deduct for $0.005/day charge).
 * The cron infrastructure calls this every hour; it will filter to users at their 8am.
 */
export async function runBriefings(
  _client: SuiJsonRpcClient,
  users: NotificationUser[],
): Promise<JobResult> {
  const eligible = users.filter((u) => u.prefs[FEATURE_KEY] !== false);

  // TODO: Phase 1.3 — generate briefing content, store in DailyBriefing table,
  // send email, charge allowance via buildDeductAllowanceTx

  return { job: 'briefings', processed: eligible.length, sent: 0, errors: 0 };
}
