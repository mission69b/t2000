import { badSymbol, okxJson, parseAsset, readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: recent liquidations read (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type LiqOrder = {
  details: { posSide: 'long' | 'short'; side: string; bkPx: string; sz: string; ts: string }[];
};
type Instrument = { ctVal: string };
type Ticker = { last: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'BTC');
  if (!asset) {
    return badSymbol(rawSymbol);
  }
  const uly = `${asset}-USDT`;
  const instId = `${asset}-USDT-SWAP`;

  const [liqR, instR, tickR] = await Promise.allSettled([
    okxJson<LiqOrder[]>(
      `/api/v5/public/liquidation-orders?instType=SWAP&uly=${uly}&state=filled&limit=100`,
      120,
    ),
    okxJson<Instrument[]>(`/api/v5/public/instruments?instType=SWAP&instId=${instId}`, 3600),
    okxJson<Ticker[]>(`/api/v5/market/ticker?instId=${instId}`, 120),
  ]);
  if (liqR.status === 'rejected' || instR.status === 'rejected' || instR.value.length === 0) {
    return upstreamDown(`Liquidation data for ${uly} (symbol may not have a USDT swap)`);
  }

  const ctVal = Number.parseFloat(instR.value[0].ctVal);
  const last = tickR.status === 'fulfilled' ? Number.parseFloat(tickR.value[0]?.last ?? '0') : 0;
  const prints = liqR.value.flatMap((o) => o.details ?? []);
  const cutoff = Date.now() - 24 * 3_600_000;
  const recent = prints.filter((p) => Number.parseInt(p.ts, 10) >= cutoff);

  const notional = (rows: typeof recent) =>
    rows.reduce((a, p) => a + Number.parseFloat(p.sz) * ctVal * Number.parseFloat(p.bkPx), 0);
  const longs = recent.filter((p) => p.posSide === 'long');
  const shorts = recent.filter((p) => p.posSide === 'short');
  const longUsd = notional(longs);
  const shortUsd = notional(shorts);
  const totalUsd = longUsd + shortUsd;

  let pulse: 'long_flush' | 'short_flush' | 'two_sided' | 'quiet';
  if (totalUsd < 50_000) {
    pulse = 'quiet';
  } else if (longUsd > shortUsd * 2.5) {
    pulse = 'long_flush';
  } else if (shortUsd > longUsd * 2.5) {
    pulse = 'short_flush';
  } else {
    pulse = 'two_sided';
  }

  const biggest = [...recent].sort(
    (a, b) =>
      Number.parseFloat(b.sz) * Number.parseFloat(b.bkPx) -
      Number.parseFloat(a.sz) * Number.parseFloat(a.bkPx),
  )[0];

  return Response.json({
    report: 'liquidation-pulse',
    symbol: asset,
    pair: instId,
    generatedAt: new Date().toISOString(),
    method:
      'OKX filled liquidation orders (last 24h, up to 100 recent orders): notional = size × contract value × bankruptcy price, split by position side. long_flush / short_flush = one side > 2.5× the other; quiet < $50k total. OKX-only lane (single venue, disclosed) — a forced-seller gauge, not a liquidation heatmap. Research context, not trade advice.',
    source: 'OKX public futures data',
    pulse,
    evidence: {
      window: '24h',
      printCount: recent.length,
      longLiquidatedUsd: Math.round(longUsd),
      shortLiquidatedUsd: Math.round(shortUsd),
      totalLiquidatedUsd: Math.round(totalUsd),
      lastPrice: last,
      biggestPrint: biggest
        ? {
            side: biggest.posSide,
            price: Number.parseFloat(biggest.bkPx),
            notionalUsd: Math.round(
              Number.parseFloat(biggest.sz) * ctVal * Number.parseFloat(biggest.bkPx),
            ),
          }
        : null,
    },
    dataGaps: [],
    read: `${asset} 24h liquidations (OKX): $${round(longUsd / 1e3, 0)}k longs vs $${round(shortUsd / 1e3, 0)}k shorts across ${recent.length} prints → ${pulse.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
