import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: perp positioning pressure (§II.17 Shelf v3).
// Sold by the "Perp Pressure" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → a crowding/squeeze classification for one perp market
// (crowded_long / crowded_short / squeeze_risk_long / squeeze_risk_short /
// balanced) built from funding, 48h OI trend, taker flow bias, and
// account positioning (OKX public futures data — Binance geo-blocks US
// egress, S.621 finding). Input: { "symbol": "ETH" } (default BTC). Every
// threshold disclosed; a missing lane degrades to an explicit gap, never a
// synthesized number.
export const dynamic = 'force-dynamic';

const OKX = 'https://www.okx.com';

type OkxEnvelope<T> = { code: string; data: T };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${OKX}${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 120 },
  });
  if (!res.ok) {
    throw new Error(`OKX ${path.split('?')[0]} ${res.status}`);
  }
  const json = (await res.json()) as OkxEnvelope<T>;
  if (json.code !== '0' || !json.data) {
    throw new Error(`OKX ${path.split('?')[0]} code ${json.code}`);
  }
  return json.data;
}

type FundingRow = { fundingRate: string; fundingTime: string };
// OKX rows are newest-first arrays: candles [ts,o,h,l,c,…], rubik [ts, …].
type CandleRow = string[];
type OiRow = [string, string, string];
type RatioRow = [string, string];
type TakerRow = [string, string, string];

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
  const instId = `${asset}-USDT-SWAP`;

  const [fundingR, candlesR, oiR, ratioR, takerR] = await Promise.allSettled([
    getJson<FundingRow[]>(`/api/v5/public/funding-rate?instId=${instId}`),
    getJson<CandleRow[]>(`/api/v5/market/candles?instId=${instId}&bar=1H&limit=48`),
    getJson<OiRow[]>(`/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${asset}&period=1H`),
    getJson<RatioRow[]>(`/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${asset}&period=1H`),
    getJson<TakerRow[]>(`/api/v5/rubik/stat/taker-volume?ccy=${asset}&instType=CONTRACTS&period=1H`),
  ]);

  if (
    fundingR.status === 'rejected' ||
    candlesR.status === 'rejected' ||
    fundingR.value.length === 0 ||
    candlesR.value.length < 2
  ) {
    // Funding + price are the core lanes — without them there is no read.
    return Response.json(
      {
        error: `No OKX perp market data for ${instId} — the symbol may not have a USDT swap. Nothing was read.`,
      },
      { status: 502 },
    );
  }

  const gaps: string[] = [];
  const fundingPct8h = Number.parseFloat(fundingR.value[0].fundingRate) * 100;
  const nextFundingTime = new Date(
    Number.parseInt(fundingR.value[0].fundingTime, 10),
  ).toISOString();

  // OKX returns newest-first — reverse into chronological order.
  const closes = [...candlesR.value].reverse().map((c) => Number.parseFloat(c[4]));
  const markPrice = closes.at(-1) as number;
  const priceChange48hPct = pctChange(closes[0], markPrice);

  const oi = oiR.status === 'fulfilled' && oiR.value.length > 1 ? [...oiR.value].reverse() : null;
  if (!oi) {
    gaps.push('open-interest lane unavailable');
  }
  const oiWindow = oi ? oi.slice(-48) : null;
  const oiNowUsd = oiWindow ? Number.parseFloat((oiWindow.at(-1) as OiRow)[1]) : null;
  const oiChange48hPct = oiWindow
    ? pctChange(Number.parseFloat(oiWindow[0][1]), oiNowUsd as number)
    : null;

  const taker =
    takerR.status === 'fulfilled' && takerR.value.length > 0
      ? takerR.value.slice(0, 24)
      : null;
  if (!taker) {
    gaps.push('taker-flow lane unavailable');
  }
  const takerBias24h = taker
    ? taker.reduce((a, r) => a + Number.parseFloat(r[1]), 0) /
      Math.max(
        taker.reduce((a, r) => a + Number.parseFloat(r[2]), 0),
        1e-9,
      )
    : null;

  const ratio =
    ratioR.status === 'fulfilled' && ratioR.value.length > 0 ? ratioR.value : null;
  if (!ratio) {
    gaps.push('account-positioning lane unavailable');
  }
  const lsRatio = ratio ? Number.parseFloat(ratio[0][1]) : null;
  const longShare = lsRatio === null ? null : lsRatio / (1 + lsRatio);

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
    ((longShare ?? 0.5) >= 0.62 || (takerBias24h ?? 1) >= 1.15)
  ) {
    pressure = 'crowded_long';
  } else if (
    fundingPct8h <= -0.01 &&
    ((longShare ?? 0.5) <= 0.45 || (takerBias24h ?? 1) <= 0.85)
  ) {
    pressure = 'crowded_short';
  } else {
    pressure = 'balanced';
  }

  return Response.json({
    report: 'perp-pressure',
    symbol: asset,
    pair: instId,
    generatedAt: new Date().toISOString(),
    method:
      'OKX USDT-perp public data, 48h window: funding = current 8h rate; OI trend = open-interest value (all OKX contracts for the asset) first→last; price = 1H closes first→last; taker bias = Σbuy ÷ Σsell contract taker volume (24h); long share = account long/short ratio → long/(1+long/short). Rules (ordered): squeeze_risk_short = funding ≤ −0.005% ∧ price > +2% ∧ OI > +3%; squeeze_risk_long = funding ≥ +0.03% ∧ price < −2% ∧ OI > +3%; crowded_long = funding ≥ +0.03% ∧ (long share ≥ 62% ∨ taker ≥ 1.15); crowded_short = funding ≤ −0.01% ∧ (long share ≤ 45% ∨ taker ≤ 0.85); else balanced. Research context, not trade advice.',
    source: 'OKX public futures data',
    pressure,
    evidence: {
      markPrice,
      fundingPct8h: Number(fundingPct8h.toFixed(4)),
      nextFundingTime,
      priceChange48hPct: Number(priceChange48hPct.toFixed(2)),
      openInterestUsd: oiNowUsd === null ? null : Math.round(oiNowUsd),
      oiChange48hPct: oiChange48hPct === null ? null : Number(oiChange48hPct.toFixed(2)),
      takerBuySellBias24h: takerBias24h === null ? null : Number(takerBias24h.toFixed(3)),
      accountLongShare: longShare === null ? null : Number(longShare.toFixed(3)),
    },
    dataGaps: gaps,
    read: `${asset} perp: funding ${fundingPct8h >= 0 ? '+' : ''}${fundingPct8h.toFixed(4)}%/8h, price ${priceChange48hPct >= 0 ? '+' : ''}${priceChange48hPct.toFixed(1)}% and OI ${oiChange48hPct === null ? 'n/a' : `${oiChange48hPct >= 0 ? '+' : ''}${oiChange48hPct.toFixed(1)}%`} over 48h${longShare !== null ? `, accounts ${((longShare as number) * 100).toFixed(0)}% long` : ''} → ${pressure.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
