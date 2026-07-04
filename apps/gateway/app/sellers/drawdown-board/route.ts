import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: distance-from-ATH board (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = {
  symbol: string;
  name: string;
  quote: {
    USD: { price: number; market_cap: number; percent_change_30d: number };
  };
};
async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  // listings/latest has no ATH field — use OHLCV-derived 365d high as the
  // reference (honest label: 1y high, not all-time).
  let coins: Listing[];
  try {
    coins = (
      await cmcJson<{ data: Listing[] }>(
        '/v1/cryptocurrency/listings/latest?limit=60&sort=market_cap',
      )
    ).data;
  } catch {
    return upstreamDown('Market data');
  }

  const symbols = coins
    .slice(0, 40)
    .map((c) => c.symbol)
    .join(',');
  let periodHighs: Record<string, number> = {};
  const gaps: string[] = [];
  try {
    const hist = await cmcJson<{
      data: Record<string, { quotes?: { quote: { USD: { high: number } } }[] }[]>;
    }>(
      `/v2/cryptocurrency/ohlcv/historical?symbol=${symbols}&count=52&interval=weekly&skip_invalid=true`,
      3600,
    );
    periodHighs = Object.fromEntries(
      Object.entries(hist.data).map(([sym, entries]) => [
        sym,
        Math.max(...(entries[0]?.quotes ?? []).map((q) => q.quote.USD.high)),
      ]),
    );
  } catch {
    gaps.push('1y-high lane unavailable — board omitted');
  }

  const rows = coins
    .slice(0, 40)
    .map((c) => {
      const high = periodHighs[c.symbol];
      if (!high || !Number.isFinite(high) || high <= 0) {
        return null;
      }
      const dd = ((c.quote.USD.price - high) / high) * 100;
      return {
        symbol: c.symbol,
        name: c.name,
        price: c.quote.USD.price,
        high1y: high,
        drawdownPct: round(dd, 1),
        change30dPct: round(c.quote.USD.percent_change_30d),
        bucket: (dd > -10
          ? 'near_high'
          : dd > -35
            ? 'corrected'
            : dd > -60
              ? 'deep_drawdown'
              : 'capitulated') as 'near_high' | 'corrected' | 'deep_drawdown' | 'capitulated',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.drawdownPct - b.drawdownPct);

  if (rows.length === 0) {
    return upstreamDown('Drawdown reference data');
  }

  const buckets = {
    near_high: rows.filter((r) => r.bucket === 'near_high').length,
    corrected: rows.filter((r) => r.bucket === 'corrected').length,
    deep_drawdown: rows.filter((r) => r.bucket === 'deep_drawdown').length,
    capitulated: rows.filter((r) => r.bucket === 'capitulated').length,
  };

  return Response.json({
    report: 'drawdown-board',
    generatedAt: new Date().toISOString(),
    method:
      'Top-40 by market cap vs their 52-week weekly-candle high (NOT all-time high — 1y is the reference, disclosed): buckets near_high > −10%, corrected > −35%, deep_drawdown > −60%, else capitulated; 30d change shown for direction. A pain map, explicitly not a buy list — cheap can get cheaper. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    buckets,
    deepest: rows.slice(0, 10),
    nearHighs: rows.slice(-5).reverse(),
    dataGaps: gaps,
    read: `${buckets.capitulated} of ${rows.length} large caps are >60% below their 1y high (deepest: ${rows[0].symbol} ${rows[0].drawdownPct}%); ${buckets.near_high} trade within 10% of it.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
