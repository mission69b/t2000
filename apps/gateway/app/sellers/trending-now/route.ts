import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: trending attention read (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Trending = {
  symbol: string;
  name: string;
  quote: {
    USD: {
      price: number;
      market_cap: number;
      volume_24h: number;
      percent_change_24h: number;
      percent_change_7d: number;
    };
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  let coins: Trending[];
  try {
    coins = (
      await cmcJson<{ data: Trending[] }>('/v1/cryptocurrency/trending/latest?limit=15')
    ).data;
  } catch {
    return upstreamDown('Trending data');
  }

  const rows = coins.map((c) => {
    const q = c.quote.USD;
    return {
      symbol: c.symbol,
      name: c.name,
      price: q.price,
      change24hPct: round(q.percent_change_24h),
      change7dPct: round(q.percent_change_7d),
      marketCapUsd: Math.round(q.market_cap),
      attention:
        q.percent_change_24h > 3
          ? 'chasing_strength'
          : q.percent_change_24h < -3
            ? 'knife_watching'
            : 'neutral_interest',
    };
  });

  const chasing = rows.filter((r) => r.attention === 'chasing_strength').length;
  const knives = rows.filter((r) => r.attention === 'knife_watching').length;
  const crowd =
    chasing > knives * 2 ? 'momentum_chasing' : knives > chasing * 2 ? 'dip_hunting' : 'mixed';

  return Response.json({
    report: 'trending-now',
    generatedAt: new Date().toISOString(),
    method:
      'CMC trending list (attention-ranked): each name tagged by 24h price context — chasing_strength (> +3%), knife_watching (< −3%), else neutral_interest. Crowd read = which tag dominates 2:1. Attention ≠ endorsement. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    crowd,
    trending: rows,
    dataGaps: [],
    read: `${rows.length} trending: ${rows.slice(0, 3).map((r) => `${r.symbol} (${r.change24hPct >= 0 ? '+' : ''}${r.change24hPct}%)`).join(', ')}… — the crowd is ${crowd.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
