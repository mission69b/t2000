import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: dominance rotation read (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type HistPoint = {
  timestamp: string;
  btc_dominance: number;
  eth_dominance: number;
};
type Hist = { data?: { quotes?: HistPoint[] } };
type Latest = { data?: { btc_dominance?: number; eth_dominance?: number } };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [latestR, histR] = await Promise.allSettled([
    cmcJson<Latest>('/v1/global-metrics/quotes/latest'),
    cmcJson<Hist>('/v1/global-metrics/quotes/historical?count=90&interval=daily'),
  ]);

  const btcNow = latestR.status === 'fulfilled' ? latestR.value.data?.btc_dominance : undefined;
  const ethNow = latestR.status === 'fulfilled' ? latestR.value.data?.eth_dominance : undefined;
  if (typeof btcNow !== 'number') {
    return upstreamDown('Dominance data');
  }

  const gaps: string[] = [];
  const quotes = histR.status === 'fulfilled' ? (histR.value.data?.quotes ?? []) : [];
  if (quotes.length < 30) {
    gaps.push('dominance history lane unavailable — trend deltas omitted');
  }
  const at = (daysBack: number): HistPoint | null =>
    quotes.length > daysBack ? quotes[quotes.length - 1 - daysBack] : null;
  const d30 = at(30);
  const d90 = at(89);
  const btcD30 = d30 ? round(btcNow - d30.btc_dominance, 2) : null;
  const btcD90 = d90 ? round(btcNow - d90.btc_dominance, 2) : null;

  let rotation: 'btc_accumulation' | 'alt_rotation' | 'balanced';
  if (btcD30 !== null && btcD30 > 1.5) {
    rotation = 'btc_accumulation';
  } else if (btcD30 !== null && btcD30 < -1.5) {
    rotation = 'alt_rotation';
  } else {
    rotation = 'balanced';
  }

  return Response.json({
    report: 'dominance-shifts',
    generatedAt: new Date().toISOString(),
    method:
      'BTC/ETH dominance now vs 30d and 90d ago (CMC global metrics, daily): btc_accumulation = BTC dominance +1.5pts over 30d; alt_rotation = −1.5pts; else balanced. Dominance rises in fear and BTC-led moves; falls when risk moves out the curve. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    rotation,
    evidence: {
      btcDominancePct: round(btcNow, 1),
      ethDominancePct: typeof ethNow === 'number' ? round(ethNow, 1) : null,
      btcDelta30dPts: btcD30,
      btcDelta90dPts: btcD90,
      altcoinSharePct:
        typeof ethNow === 'number' ? round(100 - btcNow - ethNow, 1) : round(100 - btcNow, 1),
    },
    dataGaps: gaps,
    read: `BTC dominance ${round(btcNow, 1)}%${btcD30 !== null ? ` (${btcD30 >= 0 ? '+' : ''}${btcD30}pts over 30d)` : ''} → ${rotation.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
