import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: new listings radar (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = {
  symbol: string;
  name: string;
  date_added: string;
  quote: {
    USD: { price: number; market_cap: number; volume_24h: number; percent_change_24h: number };
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  let coins: Listing[];
  try {
    coins = (
      await cmcJson<{ data: Listing[] }>('/v1/cryptocurrency/listings/new?limit=50')
    ).data;
  } catch {
    return upstreamDown('New-listings data');
  }

  const now = Date.now();
  const rows = coins.map((c) => {
    const q = c.quote.USD;
    const ageDays = round((now - Date.parse(c.date_added)) / 86_400_000, 1);
    const bucket =
      q.volume_24h >= 1_000_000 && q.market_cap >= 5_000_000
        ? 'watch'
        : q.volume_24h >= 100_000
          ? 'thin'
          : 'avoid';
    return {
      symbol: c.symbol,
      name: c.name,
      ageDays,
      price: q.price,
      marketCapUsd: Math.round(q.market_cap),
      volume24hUsd: Math.round(q.volume_24h),
      change24hPct: round(q.percent_change_24h),
      bucket,
    };
  });

  const watch = rows.filter((r) => r.bucket === 'watch');

  return Response.json({
    report: 'new-listings',
    generatedAt: new Date().toISOString(),
    method:
      'CMC newly listed coins (latest 50): bucketed watch (24h volume ≥ $1M ∧ mcap ≥ $5M), thin (volume ≥ $100k), else avoid. New listings carry outsized rug/wash risk — buckets are liquidity screens, NOT endorsements. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    counts: {
      total: rows.length,
      watch: watch.length,
      thin: rows.filter((r) => r.bucket === 'thin').length,
      avoid: rows.filter((r) => r.bucket === 'avoid').length,
    },
    listings: rows.slice(0, 25),
    dataGaps: [],
    read: `${rows.length} fresh listings; ${watch.length} clear the liquidity screen${watch.length > 0 ? ` (top: ${watch.slice(0, 3).map((r) => r.symbol).join(', ')})` : ''} — the rest are thin or illiquid.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
