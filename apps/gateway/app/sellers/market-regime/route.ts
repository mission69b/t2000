import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: crypto market-regime read (§II.17 Shelf v2).
// Sold by the "Market Regime" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → a derived regime classification (trend_expansion / range_chop /
// stress / transition) built from BTC+ETH trend structure (Binance public
// klines), realized-volatility state (14d vs 60d), drawdown, and top-50
// breadth (CoinGecko keyless). Every input lane is disclosed; a missing lane
// degrades to an explicit gap, never a synthesized number.
export const dynamic = 'force-dynamic';

const BINANCE = 'https://api.binance.com/api/v3/klines';
const CG_MARKETS =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&price_change_percentage=24h,7d';
const STABLE_IDS = new Set([
  'tether',
  'usd-coin',
  'dai',
  'first-digital-usd',
  'usds',
  'ethena-usde',
]);

type Kline = [number, string, string, string, string, string, ...unknown[]];

async function dailyCloses(symbol: string, limit = 90): Promise<number[]> {
  const res = await fetch(
    `${BINANCE}?symbol=${symbol}&interval=1d&limit=${limit}`,
    { headers: { accept: 'application/json' }, next: { revalidate: 600 } },
  );
  if (!res.ok) {
    throw new Error(`Binance ${symbol} ${res.status}`);
  }
  const rows = (await res.json()) as Kline[];
  return rows.map((r) => Number.parseFloat(r[4] as string));
}

function sma(values: number[], n: number): number {
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Annualized realized volatility (%) over the trailing n days. */
function realizedVol(closes: number[], n: number): number {
  const rets: number[] = [];
  const window = closes.slice(-(n + 1));
  for (let i = 1; i < window.length; i++) {
    rets.push(Math.log(window[i] / window[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length - 1, 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

type TrendState = 'uptrend' | 'downtrend' | 'mixed';

function trendState(closes: number[]): TrendState {
  const close = closes.at(-1) as number;
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  if (close > s20 && s20 > s50) {
    return 'uptrend';
  }
  if (close < s20 && s20 < s50) {
    return 'downtrend';
  }
  return 'mixed';
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [btcR, ethR, breadthR] = await Promise.allSettled([
    dailyCloses('BTCUSDT'),
    dailyCloses('ETHUSDT'),
    fetch(CG_MARKETS, {
      headers: { accept: 'application/json' },
      next: { revalidate: 600 },
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`CoinGecko ${r.status}`);
      }
      return (await r.json()) as {
        id: string;
        price_change_percentage_24h_in_currency?: number | null;
        price_change_percentage_7d_in_currency?: number | null;
      }[];
    }),
  ]);

  if (btcR.status === 'rejected') {
    // BTC structure is the core lane — without it there is no honest read.
    return Response.json(
      { error: 'BTC market data unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const gaps: string[] = [];
  const btc = btcR.value;
  const eth = ethR.status === 'fulfilled' ? ethR.value : null;
  if (!eth) {
    gaps.push('ETH corroboration lane unavailable');
  }
  const coins = breadthR.status === 'fulfilled' ? breadthR.value : null;
  if (!coins) {
    gaps.push('breadth lane (CoinGecko top-50) unavailable');
  }

  const btcClose = btc.at(-1) as number;
  const btcTrend = trendState(btc);
  const vol14 = realizedVol(btc, 14);
  const vol60 = realizedVol(btc, 60);
  const volState =
    vol14 > vol60 * 1.25
      ? 'expanding'
      : vol14 < vol60 * 0.8
        ? 'contracting'
        : 'stable';
  const high90 = Math.max(...btc);
  const drawdownPct = ((btcClose - high90) / high90) * 100;

  const nonStable = (coins ?? []).filter((c) => !STABLE_IDS.has(c.id));
  const breadth = coins
    ? {
        pctPositive24h: Math.round(
          (nonStable.filter(
            (c) => (c.price_change_percentage_24h_in_currency ?? 0) > 0,
          ).length /
            nonStable.length) *
            100,
        ),
        pctPositive7d: Math.round(
          (nonStable.filter(
            (c) => (c.price_change_percentage_7d_in_currency ?? 0) > 0,
          ).length /
            nonStable.length) *
            100,
        ),
      }
    : null;

  // Classification — deterministic, disclosed thresholds.
  let regime: 'trend_expansion' | 'range_chop' | 'stress' | 'transition';
  if (
    (drawdownPct < -15 && volState === 'expanding') ||
    (breadth && breadth.pctPositive24h < 25 && volState === 'expanding')
  ) {
    regime = 'stress';
  } else if (
    btcTrend === 'uptrend' &&
    volState !== 'contracting' &&
    (breadth?.pctPositive7d ?? 50) > 55
  ) {
    regime = 'trend_expansion';
  } else if (volState === 'contracting' && btcTrend === 'mixed') {
    regime = 'range_chop';
  } else {
    regime = 'transition';
  }

  return Response.json({
    report: 'market-regime',
    generatedAt: new Date().toISOString(),
    method:
      'BTC/ETH daily closes (Binance public market data, 90d): trend = close vs SMA20 vs SMA50; realized vol = stdev of log returns annualized, 14d vs 60d (expanding > 1.25×, contracting < 0.8×); drawdown vs 90d high; breadth = % of CoinGecko top-50 (ex-stables) positive 24h/7d. Deterministic thresholds, disclosed. Research context, not trade advice.',
    source:
      'Binance public market data · breadth data provided by CoinGecko (https://www.coingecko.com/en/api)',
    regime,
    evidence: {
      btc: {
        close: btcClose,
        trend: btcTrend,
        realizedVol14dPct: Number(vol14.toFixed(1)),
        realizedVol60dPct: Number(vol60.toFixed(1)),
        volState,
        drawdownFrom90dHighPct: Number(drawdownPct.toFixed(1)),
      },
      eth: eth ? { trend: trendState(eth) } : null,
      breadthTop50: breadth,
    },
    dataGaps: gaps,
    read: `BTC is in a ${btcTrend} with ${volState} volatility (14d ${vol14.toFixed(0)}% vs 60d ${vol60.toFixed(0)}% annualized), ${drawdownPct.toFixed(1)}% off the 90d high${breadth ? `; ${breadth.pctPositive7d}% of the top 50 are up on the week` : ''} → ${regime.replace('_', ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
