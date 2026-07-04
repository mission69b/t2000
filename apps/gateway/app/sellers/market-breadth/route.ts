import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: breadth gauge (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = {
  symbol: string;
  quote: {
    USD: {
      market_cap: number;
      percent_change_24h: number;
      percent_change_7d: number;
      percent_change_30d: number;
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

  const pctPositive = (pick: (c: Listing) => number) =>
    Math.round((coins.filter((c) => pick(c) > 0).length / coins.length) * 100);
  const p24 = pctPositive((c) => c.quote.USD.percent_change_24h);
  const p7 = pctPositive((c) => c.quote.USD.percent_change_7d);
  const p30 = pctPositive((c) => c.quote.USD.percent_change_30d);

  // Concentration: cap-weighted top-10 24h change vs the rest.
  const capChange = (slice: Listing[]) => {
    const cap = slice.reduce((a, c) => a + c.quote.USD.market_cap, 0);
    return slice.reduce(
      (a, c) => a + c.quote.USD.percent_change_24h * (c.quote.USD.market_cap / cap),
      0,
    );
  };
  const top10Change = capChange(coins.slice(0, 10));
  const restChange = capChange(coins.slice(10));

  let breadth: 'broad_advance' | 'narrow_leadership' | 'broad_decline' | 'mixed';
  if (p24 >= 65) {
    breadth = 'broad_advance';
  } else if (p24 <= 30) {
    breadth = 'broad_decline';
  } else if (top10Change > 0 && top10Change > restChange + 1) {
    breadth = 'narrow_leadership';
  } else {
    breadth = 'mixed';
  }

  return Response.json({
    report: 'market-breadth',
    generatedAt: new Date().toISOString(),
    method:
      'Top-100 by market cap: % positive over 24h/7d/30d; concentration = cap-weighted 24h change of the top-10 vs the rest. broad_advance ≥ 65% green 24h; broad_decline ≤ 30%; narrow_leadership = top-10 leading the rest by >1pt; else mixed. Breadth separates real trends from index illusions. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    breadth,
    evidence: {
      pctPositive24h: p24,
      pctPositive7d: p7,
      pctPositive30d: p30,
      top10CapWeightedChange24hPct: round(top10Change),
      restCapWeightedChange24hPct: round(restChange),
    },
    dataGaps: [],
    read: `${p24}% of the top-100 are green over 24h (${p7}% on the week); top-10 ${top10Change >= restChange ? 'leading' : 'lagging'} the rest (${round(top10Change, 1)}% vs ${round(restChange, 1)}%) → ${breadth.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
