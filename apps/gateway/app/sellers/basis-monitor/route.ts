import { okxJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: perp-vs-spot basis (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Ticker = { instId: string; last: string; volCcy24h: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const [swapR, spotR] = await Promise.allSettled([
    okxJson<Ticker[]>('/api/v5/market/tickers?instType=SWAP', 120),
    okxJson<Ticker[]>('/api/v5/market/tickers?instType=SPOT', 120),
  ]);
  if (swapR.status === 'rejected' || spotR.status === 'rejected') {
    return upstreamDown('Market data');
  }

  const spot = new Map(
    spotR.value
      .filter((t) => t.instId.endsWith('-USDT'))
      .map((t) => [t.instId.replace('-USDT', ''), Number.parseFloat(t.last)]),
  );

  const rows = swapR.value
    .filter((t) => t.instId.endsWith('-USDT-SWAP'))
    .map((t) => {
      const symbol = t.instId.replace('-USDT-SWAP', '');
      const perp = Number.parseFloat(t.last);
      const spotPx = spot.get(symbol);
      const quoteVol = Number.parseFloat(t.volCcy24h) * perp;
      if (!spotPx || spotPx <= 0) {
        return null;
      }
      return {
        symbol,
        basisBps: round(((perp - spotPx) / spotPx) * 10_000, 1),
        perp,
        spot: spotPx,
        quoteVol24hUsd: quoteVol,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.quoteVol24hUsd > 20_000_000)
    .sort((a, b) => b.quoteVol24hUsd - a.quoteVol24hUsd)
    .slice(0, 15);

  if (rows.length < 5) {
    return upstreamDown('Basis inputs (too few paired markets)');
  }

  const avgBasis = round(rows.reduce((a, r) => a + r.basisBps, 0) / rows.length, 1);
  const richest = [...rows].sort((a, b) => b.basisBps - a.basisBps)[0];
  const cheapest = [...rows].sort((a, b) => a.basisBps - b.basisBps)[0];

  let appetite: 'leverage_bid' | 'balanced' | 'discount_stress';
  if (avgBasis > 15) {
    appetite = 'leverage_bid';
  } else if (avgBasis < -10) {
    appetite = 'discount_stress';
  } else {
    appetite = 'balanced';
  }

  return Response.json({
    report: 'basis-monitor',
    generatedAt: new Date().toISOString(),
    method:
      'Perp last vs spot last on OKX for the 15 most-liquid USDT pairs (volume floor $20M): basis in bps. Appetite: leverage_bid = avg > +15bps; discount_stress = avg < −10bps; else balanced. Perps rich to spot = paid-up leverage demand; perps at a discount = stress or heavy shorting. A snapshot, not a carry-trade calculator. Research context, not trade advice.',
    source: 'OKX public market data',
    appetite,
    averageBasisBps: avgBasis,
    markets: rows.map((r) => ({ symbol: r.symbol, basisBps: r.basisBps })),
    extremes: {
      richest: { symbol: richest.symbol, basisBps: richest.basisBps },
      cheapest: { symbol: cheapest.symbol, basisBps: cheapest.basisBps },
    },
    dataGaps: [],
    read: `Average perp basis ${avgBasis >= 0 ? '+' : ''}${avgBasis}bps across ${rows.length} liquid pairs (richest ${richest.symbol} ${richest.basisBps >= 0 ? '+' : ''}${richest.basisBps}, cheapest ${cheapest.symbol} ${cheapest.basisBps}) → ${appetite.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
