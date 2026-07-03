import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: orderbook depth pressure (§II.17 Shelf v3).
// Sold by the "Book Depth" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → where the resting liquidity sits for one spot market:
// bid vs ask depth within ±2% of mid, the largest walls on each side,
// spread, and a pressure classification (bid_support / ask_overhang /
// balanced_two_way). Input: { "symbol": "ETH" } (default BTC).
export const dynamic = 'force-dynamic';

const BINANCE = 'https://data-api.binance.vision/api/v3/depth';
const BAND_PCT = 2;
const SKEW_BID = 1.3;
const SKEW_ASK = 1 / SKEW_BID;

type Depth = { bids: [string, string][]; asks: [string, string][] };
type Level = { price: number; qty: number };

function parseLevels(rows: [string, string][]): Level[] {
  return rows.map(([p, q]) => ({
    price: Number.parseFloat(p),
    qty: Number.parseFloat(q),
  }));
}

function usdWithin(levels: Level[], from: number, to: number): number {
  return levels
    .filter((l) => l.price >= from && l.price <= to)
    .reduce((a, l) => a + l.price * l.qty, 0);
}

function biggestWall(levels: Level[], from: number, to: number): Level | null {
  const inBand = levels.filter((l) => l.price >= from && l.price <= to);
  if (inBand.length === 0) {
    return null;
  }
  return inBand.reduce((a, b) => (b.price * b.qty > a.price * a.qty ? b : a));
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let symbol = new URL(req.url).searchParams.get('symbol') ?? '';
  if (!symbol && req.method === 'POST') {
    try {
      const body = (await req.json()) as { symbol?: string };
      symbol = body.symbol ?? '';
    } catch {
      // empty/non-JSON body → default
    }
  }
  const asset = (symbol || 'BTC').trim().toUpperCase().replace(/USDT?$/, '');
  if (!/^[A-Z0-9]{2,10}$/.test(asset)) {
    return Response.json(
      { error: `Unsupported symbol "${symbol}" — pass e.g. {"symbol":"BTC"}.` },
      { status: 400 },
    );
  }
  const pair = `${asset}USDT`;

  let book: Depth;
  try {
    const res = await fetch(`${BINANCE}?symbol=${pair}&limit=500`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      throw new Error(`Binance depth ${res.status}`);
    }
    book = (await res.json()) as Depth;
  } catch {
    return Response.json(
      {
        error: `No Binance spot orderbook for ${pair} — the symbol may not be listed. Nothing was read.`,
      },
      { status: 502 },
    );
  }

  const bids = parseLevels(book.bids ?? []);
  const asks = parseLevels(book.asks ?? []);
  if (bids.length === 0 || asks.length === 0) {
    return Response.json(
      { error: `Empty orderbook for ${pair}. Nothing was read.` },
      { status: 502 },
    );
  }

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const mid = (bestBid + bestAsk) / 2;
  const spreadBps = ((bestAsk - bestBid) / mid) * 10_000;
  const bandLow = mid * (1 - BAND_PCT / 100);
  const bandHigh = mid * (1 + BAND_PCT / 100);

  const gaps: string[] = [];
  // 500 levels may not span the full ±2% band on thin books — disclose reach.
  const bidReachPct = ((mid - (bids.at(-1) as Level).price) / mid) * 100;
  const askReachPct = (((asks.at(-1) as Level).price - mid) / mid) * 100;
  if (bidReachPct < BAND_PCT || askReachPct < BAND_PCT) {
    gaps.push(
      `book snapshot spans −${bidReachPct.toFixed(2)}%/+${askReachPct.toFixed(2)}% of mid (500 levels/side) — band truncated to what is visible`,
    );
  }

  const bidDepthUsd = usdWithin(bids, bandLow, mid);
  const askDepthUsd = usdWithin(asks, mid, bandHigh);
  const skew = askDepthUsd > 0 ? bidDepthUsd / askDepthUsd : null;

  const bidWall = biggestWall(bids, bandLow, mid);
  const askWall = biggestWall(asks, mid, bandHigh);

  // Classification — deterministic, disclosed thresholds.
  let pressure: 'bid_support' | 'ask_overhang' | 'balanced_two_way';
  if (skew !== null && skew >= SKEW_BID) {
    pressure = 'bid_support';
  } else if (skew !== null && skew <= SKEW_ASK) {
    pressure = 'ask_overhang';
  } else {
    pressure = 'balanced_two_way';
  }

  return Response.json({
    report: 'book-depth',
    symbol: asset,
    pair,
    generatedAt: new Date().toISOString(),
    method:
      `Binance spot orderbook snapshot (500 levels/side): depth = Σ price×qty within ±${BAND_PCT}% of mid; skew = bid depth ÷ ask depth (bid_support ≥ ${SKEW_BID}, ask_overhang ≤ ${SKEW_ASK.toFixed(2)}, else balanced); walls = largest single level in band. A snapshot, not a stream — books change fast. Research context, not trade advice.`,
    source: 'Binance public market data',
    pressure,
    evidence: {
      mid: Number(mid.toFixed(6)),
      spreadBps: Number(spreadBps.toFixed(2)),
      bidDepthUsdWithin2Pct: Math.round(bidDepthUsd),
      askDepthUsdWithin2Pct: Math.round(askDepthUsd),
      depthSkew: skew === null ? null : Number(skew.toFixed(3)),
      biggestBidWall: bidWall
        ? { price: bidWall.price, usd: Math.round(bidWall.price * bidWall.qty) }
        : null,
      biggestAskWall: askWall
        ? { price: askWall.price, usd: Math.round(askWall.price * askWall.qty) }
        : null,
    },
    dataGaps: gaps,
    read: `${asset} book: $${(bidDepthUsd / 1e6).toFixed(2)}M bids vs $${(askDepthUsd / 1e6).toFixed(2)}M asks within ±${BAND_PCT}% (skew ${skew === null ? 'n/a' : skew.toFixed(2)}), spread ${spreadBps.toFixed(1)}bps${bidWall ? `, largest bid wall $${(bidWall.price * bidWall.qty / 1e6).toFixed(2)}M @ ${bidWall.price}` : ''} → ${pressure.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
