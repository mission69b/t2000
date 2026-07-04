import { badSymbol, okxJson, parseAsset, pct, readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: OI-vs-price divergence (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type OiRow = [string, string, string];
type CandleRow = string[];

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'SOL');
  if (!asset) {
    return badSymbol(rawSymbol);
  }

  const [oiR, candleR] = await Promise.allSettled([
    okxJson<OiRow[]>(
      `/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${asset}&period=1H`,
      300,
    ),
    okxJson<CandleRow[]>(`/api/v5/market/candles?instId=${asset}-USDT-SWAP&bar=1H&limit=48`, 300),
  ]);
  if (
    oiR.status === 'rejected' ||
    candleR.status === 'rejected' ||
    oiR.value.length < 2 ||
    candleR.value.length < 2
  ) {
    return upstreamDown(`OI/price data for ${asset} (symbol may not have OKX contracts)`);
  }

  const oi = [...oiR.value].reverse().slice(-48);
  const closes = [...candleR.value].reverse().map((c) => Number.parseFloat(c[4]));
  const oiChangePct = pct(
    Number.parseFloat(oi[0][1]),
    Number.parseFloat((oi.at(-1) as OiRow)[1]),
  );
  const priceChangePct = pct(closes[0], closes.at(-1) as number);

  const P = 1.5;
  const O = 3;
  let setup:
    | 'new_longs_pressing'
    | 'new_shorts_pressing'
    | 'long_unwind'
    | 'short_unwind'
    | 'aligned_quiet';
  if (priceChangePct > P && oiChangePct > O) {
    setup = 'new_longs_pressing';
  } else if (priceChangePct < -P && oiChangePct > O) {
    setup = 'new_shorts_pressing';
  } else if (priceChangePct < -P && oiChangePct < -O) {
    setup = 'long_unwind';
  } else if (priceChangePct > P && oiChangePct < -O) {
    setup = 'short_unwind';
  } else {
    setup = 'aligned_quiet';
  }

  const notes: Record<typeof setup, string> = {
    new_longs_pressing: 'positioning building WITH the move — trend fuel, but crowded if funding is rich',
    new_shorts_pressing: 'shorts pressing into weakness — squeeze fuel if price stabilizes',
    long_unwind: 'longs closing into weakness — deleveraging, not fresh selling',
    short_unwind: 'shorts covering into strength — the rally may be closing, not opening, positions',
    aligned_quiet: 'no meaningful OI-price divergence in the window',
  };

  return Response.json({
    report: 'oi-divergence',
    symbol: asset,
    generatedAt: new Date().toISOString(),
    method:
      'OKX 48h window (1H bars): OI value change vs perp price change. Thresholds: price ±1.5%, OI ±3%. Four quadrants — new_longs_pressing / new_shorts_pressing / long_unwind / short_unwind; inside thresholds = aligned_quiet. OI moving faster than price marks positioning worth knowing about. Research context, not trade advice.',
    source: 'OKX public futures data',
    setup,
    evidence: {
      priceChange48hPct: round(priceChangePct),
      oiChange48hPct: round(oiChangePct),
      oiNowUsd: Math.round(Number.parseFloat((oi.at(-1) as OiRow)[1])),
      lastPrice: closes.at(-1),
    },
    dataGaps: [],
    read: `${asset}: price ${priceChangePct >= 0 ? '+' : ''}${round(priceChangePct)}% vs OI ${oiChangePct >= 0 ? '+' : ''}${round(oiChangePct)}% over 48h → ${setup.replace(/_/g, ' ')} (${notes[setup]}).`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
