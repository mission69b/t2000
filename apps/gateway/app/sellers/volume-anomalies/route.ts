import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: unusual-volume screen (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = {
  symbol: string;
  name: string;
  quote: {
    USD: {
      market_cap: number;
      volume_24h: number;
      volume_change_24h: number;
      percent_change_24h: number;
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
        '/v1/cryptocurrency/listings/latest?limit=200&sort=market_cap',
      )
    ).data;
  } catch {
    return upstreamDown('Market data');
  }

  const rows = coins
    .filter((c) => c.quote.USD.market_cap > 100_000_000 && c.quote.USD.volume_24h > 1_000_000)
    .map((c) => {
      const q = c.quote.USD;
      return {
        symbol: c.symbol,
        name: c.name,
        volume24hUsd: Math.round(q.volume_24h),
        volumeChange24hPct: round(q.volume_change_24h),
        change24hPct: round(q.percent_change_24h),
        volumeToMcap: round(q.volume_24h / q.market_cap, 3),
        shape: (q.percent_change_24h >= 1
          ? 'accumulation_shaped'
          : q.percent_change_24h <= -1
            ? 'distribution_shaped'
            : 'churn') as 'accumulation_shaped' | 'distribution_shaped' | 'churn',
      };
    })
    .filter((r) => r.volumeChange24hPct >= 80)
    .sort((a, b) => b.volumeChange24hPct - a.volumeChange24hPct)
    .slice(0, 12);

  return Response.json({
    report: 'volume-anomalies',
    generatedAt: new Date().toISOString(),
    method:
      'Coins ≥$100M mcap with 24h volume ≥ +80% vs the prior day (CMC volume_change_24h), ranked. Shape = price direction alongside the spike: up ≥1% accumulation-shaped, down ≤−1% distribution-shaped, else churn. Volume spikes mark attention, not direction — shape is context, not causation. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    anomaliesFound: rows.length,
    anomalies: rows,
    dataGaps: [],
    read:
      rows.length === 0
        ? 'No large cap is trading meaningfully above its volume baseline — a quiet tape (that IS the read).'
        : `${rows.length} volume anomalies — loudest: ${rows.slice(0, 3).map((r) => `${r.symbol} (+${r.volumeChange24hPct}% vol, ${r.shape.split('_')[0]})`).join(', ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
