import { z } from 'zod';
import { fetchRates } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, hasAgent, requireAgent } from './utils.js';

const YIELDS_API = 'https://yields.llama.fi';

function formatRatesSummary(rates: Record<string, { saveApy: number; borrowApy: number }>): string {
  return Object.entries(rates)
    .map(([asset, r]) => `${asset}: Save ${(r.saveApy * 100).toFixed(2)}% / Borrow ${(r.borrowApy * 100).toFixed(2)}%`)
    .join(', ');
}

interface DefiLlamaPool {
  chain: string;
  project: string;
  symbol: string;
  apy: number;
  apyBorrow?: number;
  tvlUsd: number;
}

async function fetchRatesFromDefiLlama(): Promise<Record<string, { saveApy: number; borrowApy: number }>> {
  const res = await fetch(`${YIELDS_API}/pools`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DefiLlama API error: HTTP ${res.status}`);
  const data = await res.json() as { data: DefiLlamaPool[] };

  const naviPools = (data.data ?? []).filter(
    (p) => p.chain === 'Sui' && p.project === 'navi-lending' && p.tvlUsd > 10_000,
  );

  const result: Record<string, { saveApy: number; borrowApy: number }> = {};
  for (const pool of naviPools) {
    const saveApy = (pool.apy ?? 0) / 100;
    const borrowApy = pool.apyBorrow != null ? Math.abs(pool.apyBorrow) / 100 : 0;
    result[pool.symbol] = { saveApy, borrowApy };
  }
  return result;
}

export const ratesInfoTool = buildTool({
  name: 'rates_info',
  description:
    'Get current NAVI Protocol lending/savings rates (APY) for supported assets on Sui. Returns save APY and borrow APY per asset.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (hasNaviMcp(context)) {
      const rates = await fetchRates(getMcpManager(context));
      return { data: rates, displayText: formatRatesSummary(rates) };
    }

    if (hasAgent(context)) {
      const agent = requireAgent(context);
      const rates = await agent.rates();
      return { data: rates, displayText: formatRatesSummary(rates) };
    }

    const rates = await fetchRatesFromDefiLlama();
    return { data: rates, displayText: formatRatesSummary(rates) };
  },
});
