import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: Sui ecosystem pulse (§II.17 Shelf v2 — the "Sui
// ecosystem pulse" candidate from §II.13). Sold by the "Sui Pulse" seed agent
// — reachable ONLY through the paid commerce delivery leg.
//
// One call → a Sui-native snapshot: network state (epoch checkpoint cadence,
// reference gas price, total transactions — keyless Sui JSON-RPC), SUI market
// data (CoinGecko keyless), and the trending on-chain pools (GeckoTerminal
// keyless). Lanes fail independently into explicit gaps.
export const dynamic = 'force-dynamic';

const SUI_RPC = 'https://fullnode.mainnet.sui.io';
const CG_SUI =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=sui&price_change_percentage=24h,7d';
const GT_TRENDING =
  'https://api.geckoterminal.com/api/v2/networks/sui-network/trending_pools?page=1';

async function rpc<T>(method: string): Promise<T> {
  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Sui RPC ${method} ${res.status}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error || json.result === undefined) {
    throw new Error(`Sui RPC ${method}: ${json.error?.message ?? 'no result'}`);
  }
  return json.result;
}

type TrendingPool = {
  attributes?: {
    name?: string;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
    reserve_in_usd?: string;
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [gasR, txR, checkpointR, marketR, trendingR] = await Promise.allSettled([
    rpc<string>('suix_getReferenceGasPrice'),
    rpc<string>('sui_getTotalTransactionBlocks'),
    rpc<string>('sui_getLatestCheckpointSequenceNumber'),
    fetch(CG_SUI, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`CoinGecko ${r.status}`);
      }
      const rows = (await r.json()) as {
        current_price?: number;
        market_cap?: number;
        total_volume?: number;
        price_change_percentage_24h_in_currency?: number;
        price_change_percentage_7d_in_currency?: number;
        market_cap_rank?: number;
      }[];
      if (!rows[0]) {
        throw new Error('SUI market row missing');
      }
      return rows[0];
    }),
    fetch(GT_TRENDING, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`GeckoTerminal ${r.status}`);
      }
      return ((await r.json()) as { data?: TrendingPool[] }).data ?? [];
    }),
  ]);

  const gaps: string[] = [];
  const network =
    gasR.status === 'fulfilled' ||
    txR.status === 'fulfilled' ||
    checkpointR.status === 'fulfilled'
      ? {
          referenceGasPriceMist:
            gasR.status === 'fulfilled' ? Number(gasR.value) : null,
          totalTransactionBlocks:
            txR.status === 'fulfilled' ? Number(txR.value) : null,
          latestCheckpoint:
            checkpointR.status === 'fulfilled' ? Number(checkpointR.value) : null,
        }
      : null;
  if (!network) {
    gaps.push('Sui RPC lane unavailable');
  }

  const market = marketR.status === 'fulfilled' ? marketR.value : null;
  if (!market) {
    gaps.push('SUI market lane (CoinGecko) unavailable');
  }
  const trending = trendingR.status === 'fulfilled' ? trendingR.value : null;
  if (!trending) {
    gaps.push('trending-pools lane (GeckoTerminal) unavailable');
  }

  if (!(network || market || trending)) {
    return Response.json(
      { error: 'All Sui pulse lanes unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const pools = (trending ?? []).slice(0, 5).map((p) => ({
    name: p.attributes?.name ?? 'unknown',
    volume24hUsd: Math.round(Number.parseFloat(p.attributes?.volume_usd?.h24 ?? '0')),
    priceChange24hPct: Number.parseFloat(
      p.attributes?.price_change_percentage?.h24 ?? '0',
    ),
    liquidityUsd: Math.round(Number.parseFloat(p.attributes?.reserve_in_usd ?? '0')),
  }));

  return Response.json({
    report: 'sui-pulse',
    generatedAt: new Date().toISOString(),
    method:
      'Network lane: keyless Sui mainnet JSON-RPC (reference gas price, total tx blocks, latest checkpoint). Market lane: SUI quote. On-chain lane: trending Sui DEX pools. Snapshot, not a forecast.',
    source:
      'Sui mainnet RPC · market data provided by CoinGecko (https://www.coingecko.com/en/api) · pools by GeckoTerminal',
    network,
    market: market
      ? {
          priceUsd: market.current_price ?? null,
          change24hPct: market.price_change_percentage_24h_in_currency ?? null,
          change7dPct: market.price_change_percentage_7d_in_currency ?? null,
          marketCapUsd: market.market_cap ?? null,
          volume24hUsd: market.total_volume ?? null,
          rank: market.market_cap_rank ?? null,
        }
      : null,
    trendingPools: pools,
    dataGaps: gaps,
    read: [
      market
        ? `SUI $${market.current_price} (${(market.price_change_percentage_24h_in_currency ?? 0) >= 0 ? '+' : ''}${(market.price_change_percentage_24h_in_currency ?? 0).toFixed(1)}% 24h, ${(market.price_change_percentage_7d_in_currency ?? 0) >= 0 ? '+' : ''}${(market.price_change_percentage_7d_in_currency ?? 0).toFixed(1)}% 7d)`
        : null,
      network?.referenceGasPriceMist != null
        ? `gas at ${network.referenceGasPriceMist} MIST`
        : null,
      pools.length > 0
        ? `hottest pool ${pools[0].name} ($${(pools[0].volume24hUsd / 1000).toFixed(0)}k 24h volume)`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
