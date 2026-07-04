import { badSymbol, okxJson, parseAsset, readInput, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: candlestick/structure pattern read (S.624 Shelf v4).
// OKX daily candles (keyless, datacenter-friendly) — not CMC OHLCV, to keep
// the heavy-credit endpoint free for the screens.
export const dynamic = 'force-dynamic';

type Candle = { o: number; h: number; l: number; c: number; v: number };

function toCandles(rows: string[][]): Candle[] {
  // OKX returns newest-first: [ts, o, h, l, c, vol, ...]
  return [...rows].reverse().map((r) => ({
    o: Number.parseFloat(r[1]),
    h: Number.parseFloat(r[2]),
    l: Number.parseFloat(r[3]),
    c: Number.parseFloat(r[4]),
    v: Number.parseFloat(r[5]),
  }));
}

function body(c: Candle): number {
  return Math.abs(c.c - c.o);
}
function range(c: Candle): number {
  return c.h - c.l;
}

type Pattern = { name: string; at: string; note: string; invalidation: number };

function detectPatterns(cs: Candle[]): Pattern[] {
  const out: Pattern[] = [];
  const last = cs.at(-1) as Candle;
  const prev = cs.at(-2) as Candle;

  // Engulfing (yesterday's body fully inside today's opposite-direction body).
  if (
    body(last) > body(prev) * 1.2 &&
    ((last.c > last.o && prev.c < prev.o && last.c > prev.o && last.o < prev.c) ||
      (last.c < last.o && prev.c > prev.o && last.c < prev.o && last.o > prev.c))
  ) {
    const bull = last.c > last.o;
    out.push({
      name: bull ? 'bullish_engulfing' : 'bearish_engulfing',
      at: 'latest candle',
      note: `${bull ? 'Buyers' : 'Sellers'} absorbed the prior candle entirely.`,
      invalidation: bull ? last.l : last.h,
    });
  }

  // Doji cluster (indecision): last 3 candles with tiny bodies.
  const last3 = cs.slice(-3);
  if (last3.every((c) => range(c) > 0 && body(c) / range(c) < 0.25)) {
    out.push({
      name: 'doji_cluster',
      at: 'last 3 candles',
      note: 'Three consecutive indecision candles — pressure balance, expect resolution.',
      invalidation: Math.min(...last3.map((c) => c.l)),
    });
  }

  // Higher-low / lower-high sequence over the last 10 swings (3-candle pivots).
  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = 2; i < cs.length - 2; i++) {
    if (cs[i].l < cs[i - 1].l && cs[i].l < cs[i + 1].l) {
      lows.push(cs[i].l);
    }
    if (cs[i].h > cs[i - 1].h && cs[i].h > cs[i + 1].h) {
      highs.push(cs[i].h);
    }
  }
  const l3 = lows.slice(-3);
  const h3 = highs.slice(-3);
  if (l3.length === 3 && l3[0] < l3[1] && l3[1] < l3[2]) {
    out.push({
      name: 'higher_lows',
      at: 'last 3 swing lows',
      note: 'Ascending demand structure.',
      invalidation: l3[1],
    });
  }
  if (h3.length === 3 && h3[0] > h3[1] && h3[1] > h3[2]) {
    out.push({
      name: 'lower_highs',
      at: 'last 3 swing highs',
      note: 'Descending supply structure.',
      invalidation: h3[1],
    });
  }

  // Range compression: 10d avg range < 55% of 30d avg range.
  const avgRange = (n: number) =>
    cs.slice(-n).reduce((a, c) => a + range(c) / c.c, 0) / n;
  if (cs.length >= 30 && avgRange(10) < avgRange(30) * 0.55) {
    out.push({
      name: 'range_compression',
      at: 'last 10 candles',
      note: 'Volatility compressed well below its month norm — energy builds for a break.',
      invalidation: last.l,
    });
  }

  return out;
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'BTC');
  if (!asset) {
    return badSymbol(rawSymbol);
  }

  let rows: string[][];
  try {
    rows = await okxJson<string[][]>(
      `/api/v5/market/candles?instId=${asset}-USDT&bar=1D&limit=60`,
      300,
    );
  } catch {
    return upstreamDown(`Daily candles for ${asset}-USDT (symbol may not be listed on OKX)`);
  }
  if (rows.length < 30) {
    return Response.json(
      {
        report: 'kline-patterns',
        symbol: asset,
        error: `Only ${rows.length} daily candles available — insufficient history for an honest structure read. Nothing synthesized.`,
      },
      { status: 502 },
    );
  }

  const candles = toCandles(rows);
  const patterns = detectPatterns(candles);
  const last = candles.at(-1) as Candle;

  return Response.json({
    report: 'kline-patterns',
    symbol: asset,
    pair: `${asset}-USDT`,
    generatedAt: new Date().toISOString(),
    method:
      'OKX daily candles (60d): engulfing = opposite-direction body ≥1.2× engulfing prior body; doji cluster = 3 candles with body <25% of range; higher-lows/lower-highs = 3-candle pivot sequences; compression = 10d avg range <55% of 30d. Each pattern carries its invalidation level. No patterns found = an honest empty list. Structural context, not a trade trigger.',
    source: 'OKX public market data',
    lastClose: last.c,
    patternsFound: patterns.length,
    patterns,
    dataGaps: [],
    read:
      patterns.length === 0
        ? `${asset}: no qualifying patterns on the daily — structure is unremarkable right now (that IS the read).`
        : `${asset}: ${patterns.map((p) => `${p.name.replace(/_/g, ' ')} (invalidates at ${p.invalidation})`).join('; ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
