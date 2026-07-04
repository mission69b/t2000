import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: large-cap momentum ranks (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = {
  symbol: string;
  name: string;
  quote: {
    USD: {
      market_cap: number;
      volume_24h: number;
      percent_change_7d: number;
      percent_change_30d: number;
      percent_change_90d: number;
    };
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  let coins: Listing[];
  try {
    coins = (
      await cmcJson<{ data: Listing[] }>(
        '/v1/cryptocurrency/listings/latest?limit=100&sort=market_cap',
      )
    ).data;
  } catch {
    return upstreamDown('Market data');
  }

  const rows = coins.map((c) => {
    const q = c.quote.USD;
    // Blended momentum, front-weighted; volume/mcap as the confirmation lane.
    const score =
      q.percent_change_7d * 0.5 + q.percent_change_30d * 0.35 + q.percent_change_90d * 0.15;
    return {
      symbol: c.symbol,
      name: c.name,
      change7dPct: round(q.percent_change_7d),
      change30dPct: round(q.percent_change_30d),
      change90dPct: round(q.percent_change_90d),
      momentumScore: round(score),
      volumeConfirmed: q.market_cap > 0 && q.volume_24h / q.market_cap >= 0.03,
      bucket: (score > 15 ? 'leader' : score > 5 ? 'building' : score < -10 ? 'fading' : 'neutral') as
        | 'leader'
        | 'building'
        | 'fading'
        | 'neutral',
    };
  });

  const ranked = [...rows].sort((a, b) => b.momentumScore - a.momentumScore);
  const leaders = ranked.filter((r) => r.bucket === 'leader').slice(0, 10);
  const building = ranked.filter((r) => r.bucket === 'building').slice(0, 10);
  const fading = ranked.filter((r) => r.bucket === 'fading').slice(-10).reverse();

  return Response.json({
    report: 'momentum-screen',
    generatedAt: new Date().toISOString(),
    method:
      'Top-100 by market cap: momentum score = 0.5×7d + 0.35×30d + 0.15×90d change; buckets leader > 15, building > 5, fading < −10; volume confirmation = 24h volume ≥ 3% of mcap. Right-side continuation screen — deliberately blind to bottoms. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    counts: {
      leaders: leaders.length,
      building: building.length,
      fading: rows.filter((r) => r.bucket === 'fading').length,
    },
    leaders,
    building,
    fading,
    dataGaps: [],
    read:
      leaders.length === 0
        ? 'No large cap clears the leader bar — momentum is broadly absent (that IS the read).'
        : `${leaders.length} leaders — top: ${leaders.slice(0, 4).map((r) => `${r.symbol} (${r.momentumScore})`).join(', ')}; ${rows.filter((r) => r.bucket === 'fading').length} fading.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
