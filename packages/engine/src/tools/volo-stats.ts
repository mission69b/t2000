import { z } from 'zod';
// [SPEC 37 v0.7a Phase 2 Batch A / 2026-05-16] buildTool → defineTool.
import { defineTool } from '../v2/define-tool.js';

const VOLO_STATS_URL = 'https://open-api.naviprotocol.io/api/volo/stats';

export const voloStatsTool = defineTool({
  name: 'volo_stats',
  description:
    'Get current VOLO liquid staking stats: vSUI APY, exchange rate, total staked SUI, and total vSUI supply.',
  inputSchema: z.object({}),
  isReadOnly: true,

  async call() {
    const res = await fetch(VOLO_STATS_URL);
    if (!res.ok) throw new Error(`VOLO API returned ${res.status}`);

    const json = (await res.json()) as Record<string, unknown>;
    const data = (json.data ?? json) as {
      apy?: number;
      exchange_rate?: number;
      exchangeRate?: number;
      total_staked?: number;
      totalStaked?: number;
      total_vsui?: number;
      totalVSui?: number;
    };

    const stats = {
      apy: data.apy ?? 0,
      exchangeRate: data.exchange_rate ?? data.exchangeRate ?? 0,
      totalStaked: data.total_staked ?? data.totalStaked ?? 0,
      totalVSui: data.total_vsui ?? data.totalVSui ?? 0,
    };

    return {
      data: stats,
      displayText: `vSUI APY: ${(stats.apy * 100).toFixed(2)}%, Rate: 1 SUI = ${(1 / stats.exchangeRate).toFixed(4)} vSUI, Total staked: ${stats.totalStaked.toLocaleString()} SUI`,
    };
  },
});
