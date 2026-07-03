import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: perp positioning pressure (§II.17 Shelf v3).
// Sold by the "Perp Pressure" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → a crowding/squeeze classification for one perp market
// (crowded_long / crowded_short / squeeze_risk_long / squeeze_risk_short /
// balanced) built from funding, 48h OI trend, taker flow bias, and
// top-trader positioning (Binance futures public data). Input:
// { "symbol": "ETH" } (default BTC). Every threshold disclosed; a missing
// lane degrades to an explicit gap, never a synthesized number.
export const dynamic = 'force-dynamic';

const FAPI = 'https://fapi.binance.com';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${FAPI}${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 120 },
  });
  if (!res.ok) {
    throw new Error(`Binance futures ${path.split('?')[0]} ${res.status}`);
  }
  return (await res.json()) as T;
}

type Premium = { markPrice: string; lastFundingRate: string; nextFundingTime: number };
type OiRow = { sumOpenInterestValue: string; timestamp: number };
type TakerRow = { buySellRatio: string };
type TopTraderRow = { longAccount: string };
type Kline = [number, string, string, string, string, ...unknown[]];

function pctChange(first: number, last: number): number {
  return ((last - first) / first) * 100;
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

  const [premiumR, klinesR, oiR, takerR, topR] = await Promise.allSettled([
    getJson<Premium>(`/fapi/v1/premiumIndex?symbol=${pair}`),
    getJson<Kline[]>(`/fapi/v1/klines?symbol=${pair}&interval=1h&limit=48`),
    getJson<OiRow[]>(`/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=48`),
    getJson<TakerRow[]>(`/futures/data/takerlongshortRatio?symbol=${pair}&period=1h&limit=24`),
    getJson<TopTraderRow[]>(`/futures/data/topLongShortAccountRatio?symbol=${pair}&period=1h&limit=24`),
  ]);

  if (premiumR.status === 'rejected' || klinesR.status === 'rejected') {
    // Funding + price are the core lanes — without them there is no read.
    return Response.json(
      {
        error: `No Binance perp market data for ${pair} — the symbol may not have a USDT perp. Nothing was read.`,
      },
      { status: 502 },
    );
  }

  const gaps: string[] = [];
  const fundingPct8h = Number.parseFloat(premiumR.value.lastFundingRate) * 100;
  const mark = Number.parseFloat(premiumR.value.markPrice);
  const closes = klinesR.value.map((k) => Number.parseFloat(k[4] as string));
  const priceChange48hPct = pctChange(closes[0], closes.at(-1) as number);

  const oi = oiR.status === 'fulfilled' && oiR.value.length > 1 ? oiR.value : null;
  if (!oi) {
    gaps.push('open-interest lane unavailable');
  }
  const oiNowUsd = oi ? Number.parseFloat((oi.at(-1) as OiRow).sumOpenInterestValue) : null;
  const oiChange48hPct = oi
    ? pctChange(
        Number.parseFloat(oi[0].sumOpenInterestValue),
        Number.parseFloat((oi.at(-1) as OiRow).sumOpenInterestValue),
      )
    : null;

  const taker = takerR.status === 'fulfilled' && takerR.value.length > 0 ? takerR.value : null;
  if (!taker) {
    gaps.push('taker-flow lane unavailable');
  }
  const takerBias24h = taker
    ? taker.reduce((a, r) => a + Number.parseFloat(r.buySellRatio), 0) / taker.length
    : null;

  const top = topR.status === 'fulfilled' && topR.value.length > 0 ? topR.value : null;
  if (!top) {
    gaps.push('top-trader positioning lane unavailable');
  }
  const topLongShare = top ? Number.parseFloat((top.at(-1) as TopTraderRow).longAccount) : null;

  // Classification — deterministic, disclosed thresholds, ordered rules.
  let pressure:
    | 'squeeze_risk_short'
    | 'squeeze_risk_long'
    | 'crowded_long'
    | 'crowded_short'
    | 'balanced';
  if (
    fundingPct8h <= -0.005 &&
    priceChange48hPct > 2 &&
    (oiChange48hPct ?? 0) > 3
  ) {
    pressure = 'squeeze_risk_short';
  } else if (
    fundingPct8h >= 0.03 &&
    priceChange48hPct < -2 &&
    (oiChange48hPct ?? 0) > 3
  ) {
    pressure = 'squeeze_risk_long';
  } else if (
    fundingPct8h >= 0.03 &&
    ((topLongShare ?? 0.5) >= 0.62 || (takerBias24h ?? 1) >= 1.15)
  ) {
    pressure = 'crowded_long';
  } else if (
    fundingPct8h <= -0.01 &&
    ((topLongShare ?? 0.5) <= 0.45 || (takerBias24h ?? 1) <= 0.85)
  ) {
    pressure = 'crowded_short';
  } else {
    pressure = 'balanced';
  }

  return Response.json({
    report: 'perp-pressure',
    symbol: asset,
    pair,
    generatedAt: new Date().toISOString(),
    method:
      'Binance USDT-perp public data, 48h window: funding = last 8h rate; OI trend = Σ open-interest value first→last; price = 1h closes first→last; taker bias = mean buy/sell ratio (24h); top-trader long share = latest account ratio. Rules (ordered): squeeze_risk_short = funding ≤ −0.005% ∧ price > +2% ∧ OI > +3%; squeeze_risk_long = funding ≥ +0.03% ∧ price < −2% ∧ OI > +3%; crowded_long = funding ≥ +0.03% ∧ (top-long ≥ 62% ∨ taker ≥ 1.15); crowded_short = funding ≤ −0.01% ∧ (top-long ≤ 45% ∨ taker ≤ 0.85); else balanced. Research context, not trade advice.',
    source: 'Binance futures public market data',
    pressure,
    evidence: {
      markPrice: mark,
      fundingPct8h: Number(fundingPct8h.toFixed(4)),
      nextFundingTime: new Date(premiumR.value.nextFundingTime).toISOString(),
      priceChange48hPct: Number(priceChange48hPct.toFixed(2)),
      openInterestUsd: oiNowUsd ? Math.round(oiNowUsd) : null,
      oiChange48hPct: oiChange48hPct === null ? null : Number(oiChange48hPct.toFixed(2)),
      takerBuySellBias24h: takerBias24h === null ? null : Number(takerBias24h.toFixed(3)),
      topTraderLongShare: topLongShare === null ? null : Number(topLongShare.toFixed(3)),
    },
    dataGaps: gaps,
    read: `${asset} perp: funding ${fundingPct8h >= 0 ? '+' : ''}${fundingPct8h.toFixed(4)}%/8h, price ${priceChange48hPct >= 0 ? '+' : ''}${priceChange48hPct.toFixed(1)}% and OI ${oiChange48hPct === null ? 'n/a' : `${oiChange48hPct >= 0 ? '+' : ''}${oiChange48hPct.toFixed(1)}%`} over 48h${topLongShare !== null ? `, top traders ${(topLongShare * 100).toFixed(0)}% long` : ''} → ${pressure.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
