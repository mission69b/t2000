import { z } from 'zod';
import { buildTool } from '../tool.js';
import { fetchTokenPrices } from '../defillama-prices.js';

const LLAMA_API = 'https://api.llama.fi';
const YIELDS_API = 'https://yields.llama.fi';
const COINS_API = 'https://coins.llama.fi';

const CACHE_TTL = 60_000;
const apiCache = new Map<string, { data: unknown; ts: number }>();

async function cachedFetch<T>(url: string): Promise<T> {
  const hit = apiCache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DefiLlama API error: HTTP ${res.status}`);
  const data = await res.json();
  apiCache.set(url, { data, ts: Date.now() });
  return data as T;
}

/**
 * [v1.4] Named, exported helper for fetching the raw DefiLlama yield pool
 * dataset. Extracted from the inline `cachedFetch` call below so tests
 * (and other tools) can stub it.
 */
export async function fetchDefillamaYieldPools(): Promise<YieldPool[]> {
  const data = await cachedFetch<{ data: YieldPool[] }>(`${YIELDS_API}/pools`);
  return data.data ?? [];
}

// ---------------------------------------------------------------------------
// 1. defillama_yield_pools
// ---------------------------------------------------------------------------

interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase?: number;
  apyReward?: number;
}

function fmtToolTvl(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(1)}M`;
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(0)}K`;
  return `$${tvl}`;
}

export const defillamaYieldPoolsTool = buildTool({
  name: 'defillama_yield_pools',
  description:
    'Get top DeFi yield pools across protocols. Filter by chain (e.g. "Sui"), project (e.g. "navi-lending"), and minimum TVL. For NAVI lending rates, use project "navi-lending".',
  inputSchema: z.object({
    chain: z.string().optional().describe('Filter by chain name (e.g. "Sui", "Ethereum")'),
    project: z.string().optional().describe('Filter by protocol project name (e.g. "navi-lending", "cetus-clmm")'),
    limit: z.number().min(1).max(20).optional().describe('Max results (default 5)'),
    minTvl: z.number().optional().describe('Minimum TVL in USD to filter out small/risky pools (default 100000)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string', description: 'Filter by chain name' },
      project: { type: 'string', description: 'Filter by protocol project name (e.g. "navi-lending")' },
      limit: { type: 'number', description: 'Max results (default 5)' },
      minTvl: { type: 'number', description: 'Minimum TVL in USD (default 100000)' },
    },
    required: [],
  },
  isReadOnly: true,
  maxResultSizeChars: 6_000,

  async call(input): Promise<{ data: Record<string, unknown> | unknown[]; displayText: string }> {
    // [v1.4 ACI] Refuse cross-chain queries — DefiLlama's pool list is
    // unbounded across networks, and unfiltered results are wide enough to
    // bias the LLM. Force the caller to commit to a chain (or pick one of
    // the suggested popular chains) before pouring data in.
    if (!input.chain && !input.project) {
      const all = await fetchDefillamaYieldPools();
      const chainCounts = new Map<string, number>();
      for (const p of all) {
        chainCounts.set(p.chain, (chainCounts.get(p.chain) ?? 0) + 1);
      }
      const topChains = [...chainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([chain, count]) => ({ chain, pools: count }));
      return {
        data: {
          _refine: {
            reason: 'Cross-chain yield search is too broad; pick a chain.',
            suggestedParams: { chain: 'Sui' },
            availableChains: topChains,
          },
        },
        displayText:
          'Yield query needs a chain filter. Common chains: ' +
          topChains.map((c) => c.chain).join(', '),
      };
    }

    let pools = await fetchDefillamaYieldPools();

    if (input.chain) {
      const chain = input.chain.toLowerCase();
      pools = pools.filter((p) => p.chain.toLowerCase() === chain);
    }

    if (input.project) {
      const project = input.project.toLowerCase();
      pools = pools.filter((p) => p.project.toLowerCase() === project);
    }

    const minTvl = input.minTvl ?? 100_000;
    pools = pools.filter((p) => p.tvlUsd >= minTvl);

    pools.sort((a, b) => b.apy - a.apy);
    const limit = input.limit ?? 5;
    const top = pools.slice(0, limit);

    const results = top.map((p) => ({
      pool: p.symbol,
      protocol: p.project,
      chain: p.chain,
      apy: Math.round(p.apy * 100) / 100,
      apyBase: p.apyBase != null ? Math.round(p.apyBase * 100) / 100 : undefined,
      apyReward: p.apyReward != null ? Math.round(p.apyReward * 100) / 100 : undefined,
      tvl: Math.round(p.tvlUsd),
    }));

    return {
      data: results,
      displayText: results
        .map((r) => `${r.pool} (${r.protocol}): ${r.apy}% APY, ${fmtToolTvl(r.tvl)} TVL`)
        .join('\n'),
    };
  },
});

// ---------------------------------------------------------------------------
// 2. defillama_protocol_info
// ---------------------------------------------------------------------------

interface ProtocolInfo {
  name: string;
  category: string;
  chains: string[];
  tvl: number;
  change_1d?: number;
  change_7d?: number;
  url: string;
  description?: string;
}

export const defillamaProtocolInfoTool = buildTool({
  name: 'defillama_protocol_info',
  description:
    'Get detailed info about a DeFi protocol: TVL, category, chains it operates on, and TVL changes. Use for "Is this protocol safe?" or "Tell me about NAVI."',
  inputSchema: z.object({
    name: z.string().describe('Protocol name (e.g. "navi-lending", "cetus")'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Protocol slug (e.g. "navi-lending")' },
    },
    required: ['name'],
  },
  isReadOnly: true,
  maxResultSizeChars: 4_000,

  async call(input) {
    const data = await cachedFetch<ProtocolInfo>(`${LLAMA_API}/protocol/${encodeURIComponent(input.name)}`);

    const result = {
      name: data.name,
      category: data.category,
      chains: data.chains,
      tvl: Math.round(data.tvl),
      change1d: data.change_1d,
      change7d: data.change_7d,
      url: data.url,
      description: data.description,
    };

    return {
      data: result,
      displayText: `${result.name}: ${fmtToolTvl(result.tvl)} TVL (${result.category}) on ${result.chains.join(', ')}`,
    };
  },
});

// ---------------------------------------------------------------------------
// 3. defillama_token_prices
// ---------------------------------------------------------------------------

export const defillamaTokenPricesTool = buildTool({
  name: 'defillama_token_prices',
  description:
    'Get current USD prices for Sui tokens. Accepts full coin type strings (e.g. "0x2::sui::SUI"). Returns price per token.',
  inputSchema: z.object({
    coinTypes: z.array(z.string()).min(1).max(10).describe('Array of Sui coin type strings'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      coinTypes: { type: 'array', items: { type: 'string' }, description: 'Sui coin type strings' },
    },
    required: ['coinTypes'],
  },
  isReadOnly: true,

  async call(input) {
    const prices = await fetchTokenPrices(input.coinTypes);

    const results = input.coinTypes.map((ct) => ({
      coinType: ct,
      symbol: ct.split('::').pop() ?? ct,
      price: prices[ct] ?? null,
    }));

    return {
      data: results,
      displayText: results
        .map((r) => `${r.symbol}: ${r.price != null ? `$${r.price.toFixed(4)}` : 'price unavailable'}`)
        .join(', '),
    };
  },
});

// ---------------------------------------------------------------------------
// 4. defillama_price_change
// ---------------------------------------------------------------------------

export const defillamaPriceChangeTool = buildTool({
  name: 'defillama_price_change',
  description:
    'Get price change for a Sui token over a period. Shows current price and historical price to calculate % change.',
  inputSchema: z.object({
    coinType: z.string().describe('Sui coin type (e.g. "0x2::sui::SUI")'),
    period: z.enum(['1h', '24h', '7d', '30d']).optional().describe('Period (default "24h")'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      coinType: { type: 'string', description: 'Sui coin type string' },
      period: { type: 'string', description: 'Period: 1h, 24h, 7d, 30d' },
    },
    required: ['coinType'],
  },
  isReadOnly: true,

  async call(input) {
    const period = input.period ?? '24h';
    const hoursMap: Record<string, number> = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };
    const hours = hoursMap[period] ?? 24;
    const historicalTs = Math.floor(Date.now() / 1000) - hours * 3600;

    const coinKey = `sui:${input.coinType}`;
    const [current, historical] = await Promise.all([
      cachedFetch<{ coins: Record<string, { price: number }> }>(
        `${COINS_API}/prices/current/${encodeURIComponent(coinKey)}`,
      ),
      cachedFetch<{ coins: Record<string, { price: number }> }>(
        `${COINS_API}/prices/historical/${historicalTs}/${encodeURIComponent(coinKey)}`,
      ),
    ]);

    const currentPrice = current.coins[coinKey]?.price;
    const historicalPrice = historical.coins[coinKey]?.price;

    const symbol = input.coinType.split('::').pop() ?? input.coinType;

    if (currentPrice == null) {
      return {
        data: { symbol, currentPrice: 0, historicalPrice: null as number | null, change: null as number | null, period },
        displayText: 'Token price not available on DefiLlama.',
      };
    }

    const change = historicalPrice
      ? Math.round(((currentPrice - historicalPrice) / historicalPrice) * 10000) / 100
      : null;

    return {
      data: {
        symbol,
        currentPrice,
        historicalPrice: historicalPrice ?? null as number | null,
        change,
        period,
      },
      displayText: change != null
        ? `${symbol}: $${currentPrice.toFixed(4)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}% over ${period})`
        : `${symbol}: $${currentPrice.toFixed(4)}`,
    };
  },
});

// ---------------------------------------------------------------------------
// 5. defillama_chain_tvl
// ---------------------------------------------------------------------------

interface ChainTvl {
  name: string;
  tvl: number;
  gecko_id?: string;
}

export const defillamaChainTvlTool = buildTool({
  name: 'defillama_chain_tvl',
  description:
    'Get chain TVL rankings. Shows top chains by total value locked. Use for "How big is Sui?" or "Compare chains."',
  inputSchema: z.object({
    limit: z.number().min(1).max(20).optional().describe('Max results (default 10)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    required: [],
  },
  isReadOnly: true,

  async call(input) {
    const data = await cachedFetch<ChainTvl[]>(`${LLAMA_API}/v2/chains`);
    const sorted = [...data].sort((a, b) => b.tvl - a.tvl);
    const limit = input.limit ?? 10;
    const top = sorted.slice(0, limit);

    const results = top.map((c, i) => ({
      rank: i + 1,
      chain: c.name,
      tvl: Math.round(c.tvl),
    }));

    return {
      data: results,
      displayText: results
        .map((r) => `#${r.rank} ${r.chain}: $${(r.tvl / 1e9).toFixed(2)}B`)
        .join('\n'),
    };
  },
});

// ---------------------------------------------------------------------------
// 6. defillama_protocol_fees
// ---------------------------------------------------------------------------

interface ProtocolFee {
  name: string;
  total24h?: number;
  total7d?: number;
  totalAllTime?: number;
  category?: string;
  chains?: string[];
}

export const defillamaProtocolFeesTool = buildTool({
  name: 'defillama_protocol_fees',
  description:
    'Get protocol fee/revenue rankings. Shows which protocols earn the most in fees. Use for "Which protocols are most profitable?"',
  inputSchema: z.object({
    chain: z.string().optional().describe('Filter by chain'),
    limit: z.number().min(1).max(20).optional().describe('Max results (default 5)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string', description: 'Filter by chain' },
      limit: { type: 'number', description: 'Max results (default 5)' },
    },
    required: [],
  },
  isReadOnly: true,

  async call(input) {
    const data = await cachedFetch<{ protocols: ProtocolFee[] }>(`${LLAMA_API}/overview/fees`);
    let protocols = data.protocols ?? [];

    if (input.chain) {
      const chain = input.chain.toLowerCase();
      protocols = protocols.filter((p) =>
        p.chains?.some((c) => c.toLowerCase() === chain),
      );
    }

    protocols.sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0));
    const limit = input.limit ?? 5;
    const top = protocols.slice(0, limit);

    const results = top.map((p) => ({
      name: p.name,
      fees24h: p.total24h != null ? Math.round(p.total24h) : null,
      fees7d: p.total7d != null ? Math.round(p.total7d) : null,
      category: p.category,
    }));

    return {
      data: results,
      displayText: results
        .map((r) => `${r.name}: $${r.fees24h != null ? (r.fees24h / 1e3).toFixed(1) + 'K' : '?'}/day`)
        .join('\n'),
    };
  },
});

export const defillamaSuiProtocolsTool = buildTool({
  name: 'defillama_sui_protocols',
  description:
    'List top DeFi protocols on Sui by TVL. Shows name, TVL, category, and slug for each protocol. Use to discover protocols before calling defillama_protocol_info.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Max protocols to return (default 10)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max protocols to return (default 10)' },
    },
  },
  isReadOnly: true,

  async call(input) {
    const limit = input.limit ?? 10;
    const data = await cachedFetch<Array<{
      name: string;
      slug: string;
      tvl: number;
      category: string;
      chain: string;
      chains: string[];
    }>>(`${LLAMA_API}/protocols`);

    const suiProtocols = data
      .filter((p) => p.chains?.includes('Sui') && p.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, limit);

    const results = suiProtocols.map((p) => ({
      name: p.name,
      slug: p.slug,
      tvl: Math.round(p.tvl),
      category: p.category,
    }));

    return {
      data: results,
      displayText: results
        .map((r, i) => `${i + 1}. ${r.name} (${fmtToolTvl(r.tvl)} TVL, ${r.category})`)
        .join('\n'),
    };
  },
});
