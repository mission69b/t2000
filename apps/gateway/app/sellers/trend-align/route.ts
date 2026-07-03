import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: multi-timeframe trend alignment (§II.17 Shelf v2).
// Sold by the "Trend Align" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → whether a token trades bullish, bearish, or mixed across 1h /
// 4h / 1d (EMA20 vs EMA50 + close position, Binance public klines), plus the
// recent swing levels that frame the read. Input: { "symbol": "ETH" }
// (default BTC). Unsupported symbols return an explicit error (refund), not
// a guess.
export const dynamic = 'force-dynamic';

const BINANCE = 'https://data-api.binance.vision/api/v3/klines';
const TIMEFRAMES = ['1h', '4h', '1d'] as const;

type Kline = [number, string, string, string, string, string, ...unknown[]];
type Candle = { high: number; low: number; close: number };

async function candles(
  symbol: string,
  interval: string,
  limit = 120,
): Promise<Candle[]> {
  const res = await fetch(
    `${BINANCE}?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    { headers: { accept: 'application/json' }, next: { revalidate: 300 } },
  );
  if (!res.ok) {
    throw new Error(`Binance ${symbol} ${interval} ${res.status}`);
  }
  const rows = (await res.json()) as Kline[];
  return rows.map((r) => ({
    high: Number.parseFloat(r[2] as string),
    low: Number.parseFloat(r[3] as string),
    close: Number.parseFloat(r[4] as string),
  }));
}

function ema(values: number[], n: number): number {
  const k = 2 / (n + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

type TfRead = 'bullish' | 'bearish' | 'mixed';

function readTimeframe(cs: Candle[]): { state: TfRead; ema20: number; ema50: number } {
  const closes = cs.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const close = closes.at(-1) as number;
  let state: TfRead = 'mixed';
  if (close > e20 && e20 > e50) {
    state = 'bullish';
  } else if (close < e20 && e20 < e50) {
    state = 'bearish';
  }
  return { state, ema20: e20, ema50: e50 };
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  // Symbol from the buyer's input: POST body {"symbol":"ETH"} or ?symbol=.
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

  const results = await Promise.allSettled(
    TIMEFRAMES.map((tf) => candles(pair, tf)),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed === TIMEFRAMES.length) {
    return Response.json(
      {
        error: `No Binance market data for ${pair} — the symbol may not be listed. Nothing was read.`,
      },
      { status: 502 },
    );
  }

  const gaps: string[] = [];
  const frames: Record<string, { state: TfRead; ema20: number; ema50: number } | null> = {};
  results.forEach((r, i) => {
    const tf = TIMEFRAMES[i];
    if (r.status === 'fulfilled') {
      frames[tf] = readTimeframe(r.value);
    } else {
      frames[tf] = null;
      gaps.push(`${tf} lane unavailable`);
    }
  });

  const states = TIMEFRAMES.map((tf) => frames[tf]?.state).filter(
    (s): s is TfRead => Boolean(s),
  );
  const bulls = states.filter((s) => s === 'bullish').length;
  const bears = states.filter((s) => s === 'bearish').length;
  const alignment =
    bulls === states.length
      ? 'aligned_bullish'
      : bears === states.length
        ? 'aligned_bearish'
        : bulls > bears
          ? 'majority_bullish'
          : bears > bulls
            ? 'majority_bearish'
            : 'mixed';

  // Swing frame from the daily lane (or the largest available).
  const daily = results[2].status === 'fulfilled' ? results[2].value : null;
  const swing = daily
    ? {
        swingHigh20d: Math.max(...daily.slice(-20).map((c) => c.high)),
        swingLow20d: Math.min(...daily.slice(-20).map((c) => c.low)),
        lastClose: daily.at(-1)?.close ?? null,
      }
    : null;

  return Response.json({
    report: 'trend-alignment',
    symbol: asset,
    pair,
    generatedAt: new Date().toISOString(),
    method:
      'Per timeframe (1h/4h/1d, Binance public klines): bullish = close > EMA20 > EMA50, bearish = inverse, else mixed. Alignment = agreement across available frames. Swing levels = 20-bar daily high/low. Deterministic; research context, not a trade signal.',
    source: 'Binance public market data',
    alignment,
    timeframes: Object.fromEntries(
      TIMEFRAMES.map((tf) => [
        tf,
        frames[tf]
          ? {
              state: frames[tf]?.state,
              ema20: Number(frames[tf]?.ema20.toFixed(6)),
              ema50: Number(frames[tf]?.ema50.toFixed(6)),
            }
          : null,
      ]),
    ),
    levels: swing,
    dataGaps: gaps,
    read: `${asset} is ${alignment.replace('_', ' ')} across ${states.length} timeframe${states.length === 1 ? '' : 's'} (${TIMEFRAMES.filter((tf) => frames[tf]).map((tf) => `${tf}: ${frames[tf]?.state}`).join(', ')})${swing ? `; last ${swing.lastClose} vs 20d swing ${swing.swingLow20d}–${swing.swingHigh20d}` : ''}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
