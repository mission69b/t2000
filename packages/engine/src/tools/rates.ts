import { z } from 'zod';
import { fetchRates } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcpGlobal, getMcpManager, hasAgent, requireAgent } from './utils.js';

const YIELDS_API = 'https://yields.llama.fi';

/**
 * [v0.46.6] Stablecoin allow-list used by the `stableOnly` filter.
 *
 * Lower-cased symbol matching — covers the canonical USDC/USDT family
 * and the Sui-native synthetic stables (USDSUI, USDY, suiUSDT, USDe,
 * AUSD, FDUSD, BUCK). Excludes XAUm (gold-pegged, not USD-pegged) and
 * any LST/LRT.
 */
const STABLECOIN_SYMBOLS = new Set<string>([
  'usdc',
  'wusdc',
  'usdt',
  'wusdt',
  'suiusdt',
  'usdy',
  'usdsui',
  'usde',
  'ausd',
  'fdusd',
  'buck',
]);

type RateMap = Record<string, { saveApy: number; borrowApy: number }>;

function isStable(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol.toLowerCase());
}

function applyFilters(
  rates: RateMap,
  opts: { assets?: string[]; stableOnly?: boolean; topN?: number },
): RateMap {
  let entries = Object.entries(rates);
  if (opts.assets && opts.assets.length) {
    const wanted = new Set(opts.assets.map((a) => a.toLowerCase()));
    entries = entries.filter(([sym]) => wanted.has(sym.toLowerCase()));
  } else if (opts.stableOnly) {
    entries = entries.filter(([sym]) => isStable(sym));
  }
  // Sort by save APY desc so `topN` picks the best yields when no
  // explicit `assets` filter was supplied.
  entries.sort(([, a], [, b]) => b.saveApy - a.saveApy);
  if (opts.topN && opts.topN > 0) {
    entries = entries.slice(0, opts.topN);
  }
  return Object.fromEntries(entries);
}

function formatRatesSummary(rates: RateMap): string {
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
    'NAVI Protocol lending markets ONLY (single-sided save/borrow, no impermanent-loss risk). Use this for stablecoin and bluechip lending yields. Renders a rich rates card. Filter args: `assets` (specific symbols like ["USDC"]), `stableOnly` (true to show only USD-pegged assets), `topN` (max rows in card, default 8, max 50). Do NOT call defillama_yield_pools in the same turn — that tool is for LP/farming pools with IL risk, not lending.',
  inputSchema: z.object({
    assets: z
      .array(z.string())
      .optional()
      .describe('Filter to specific asset symbols (e.g. ["USDC"], ["USDC","USDT","USDSUI"]). Case-insensitive.'),
    stableOnly: z
      .boolean()
      .optional()
      .describe('When true, return only stablecoin markets (USDC, USDT, USDSUI, USDY, suiUSDT, etc.). Ignored when `assets` is supplied.'),
    topN: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Cap the number of rows in the card (default 8). Use 50 to render the full NAVI catalog.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      assets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter to specific asset symbols (case-insensitive).',
      },
      stableOnly: {
        type: 'boolean',
        description: 'When true, return only stablecoin markets. Ignored when `assets` is supplied.',
      },
      topN: {
        type: 'number',
        description: 'Cap the number of rows in the card (default 8, max 50).',
      },
    },
    required: [],
  },
  isReadOnly: true,

  async call(input, context) {
    const opts = {
      assets: input.assets,
      stableOnly: input.stableOnly,
      topN: input.topN ?? 8,
    };

    // MCP first (real-time, includes borrow rates) — no wallet needed for global rates
    if (hasNaviMcpGlobal(context)) {
      const all = await fetchRates(getMcpManager(context));
      const filtered = applyFilters(all, opts);
      return { data: filtered, displayText: formatRatesSummary(filtered) };
    }

    // SDK agent second
    if (hasAgent(context)) {
      const agent = requireAgent(context);
      const all = await agent.rates();
      const filtered = applyFilters(all, opts);
      return { data: filtered, displayText: formatRatesSummary(filtered) };
    }

    // DefiLlama fallback (supply-only, no borrow rates)
    const all = await fetchRatesFromDefiLlama();
    const filtered = applyFilters(all, opts);
    return { data: filtered, displayText: formatRatesSummary(filtered) };
  },
});

// Exported for testing.
export const _internal = { applyFilters, isStable, STABLECOIN_SYMBOLS };
