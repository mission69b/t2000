import {
  grossRewardUsd,
  isTasksConfigured,
  listPayouts,
  spentGrossMicros,
  TASKS,
  TASKS_LAUNCH_AT,
} from '@/lib/tasks';

// GET /tasks/stats — public, receipt-derived task tickers for the store's
// /tasks page (and any agent). Every payout row points at its Sui settlement
// tx; the totals are sums over those rows, never self-reports.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const active = isTasksConfigured();
  const tasks = await Promise.all(
    TASKS.map(async (t) => {
      const [spentMicros, payouts] = active
        ? await Promise.all([spentGrossMicros(t.id), listPayouts(t.id)])
        : [0, []];
      const spentUsd = spentMicros / 1e6;
      return {
        id: t.id,
        kind: t.kind,
        rewardNetUsd: t.rewardNetUsd,
        rewardGrossUsd: grossRewardUsd(t.rewardNetUsd),
        budgetUsd: t.budgetUsd,
        spentUsd: Number(spentUsd.toFixed(2)),
        paidCount: payouts.length,
        status:
          spentUsd + grossRewardUsd(t.rewardNetUsd) > t.budgetUsd
            ? 'paused'
            : 'live',
        payouts: payouts.slice(0, 20).map((p) => ({
          wallet: p.wallet,
          netUsd: p.netUsd,
          at: p.at,
          tx: p.digest,
        })),
      };
    }),
  );
  return Response.json(
    { active, launchedAt: TASKS_LAUNCH_AT.toISOString(), tasks },
    { headers: { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  );
}
