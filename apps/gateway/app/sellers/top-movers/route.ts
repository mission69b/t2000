import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: top movers with volume confirmation (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = {
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
    .filter((c) => c.quote.USD.market_cap > 50_000_000)
    .map((c) => {
      const q = c.quote.USD;
      const volToCap = q.market_cap > 0 ? q.volume_24h / q.market_cap : 0;
      return {
        symbol: c.symbol,
        name: c.name,
        price: q.price,
        change24hPct: round(q.percent_change_24h),
        change7dPct: round(q.percent_change_7d),
        volumeToMcap: round(volToCap, 3),
        // Thin volume + big move = suspect; disclosed, not hidden.
        volumeConfirmed: volToCap >= 0.05,
      };
    });

  const byChange = [...rows].sort((a, b) => b.change24hPct - a.change24hPct);
  const gainers = byChange.slice(0, 8);
  const losers = byChange.slice(-8).reverse();
  const pctPositive = Math.round(
    (rows.filter((r) => r.change24hPct > 0).length / rows.length) * 100,
  );

  return Response.json({
    report: 'top-movers',
    generatedAt: new Date().toISOString(),
    method:
      'Top-200 by market cap (floor $50M): ranked by 24h change; volume confirmation = 24h volume ≥ 5% of market cap (below → flagged thin, the move is suspect); breadth = % positive 24h. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    breadthPctPositive24h: pctPositive,
    gainers,
    losers,
    dataGaps: [],
    read: `${gainers[0].symbol} leads (+${gainers[0].change24hPct}% 24h${gainers[0].volumeConfirmed ? ', volume-confirmed' : ', THIN volume'}), ${losers[0].symbol} lags (${losers[0].change24hPct}%); ${pctPositive}% of large caps are green.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
