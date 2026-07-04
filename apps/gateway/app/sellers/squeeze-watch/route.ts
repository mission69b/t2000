import { okxJson, pct, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: short-squeeze fuel ranking (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Ticker = { instId: string; last: string; open24h: string; volCcy24h: string };
type Funding = { fundingRate: string };
type OiRow = [string, string, string];

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  let tickers: Ticker[];
  try {
    tickers = await okxJson<Ticker[]>('/api/v5/market/tickers?instType=SWAP', 180);
  } catch {
    return upstreamDown('Perp universe data');
  }

  // Stage 1: price rising with real volume.
  const rising = tickers
    .filter((t) => t.instId.endsWith('-USDT-SWAP'))
    .map((t) => {
      const last = Number.parseFloat(t.last);
      const open = Number.parseFloat(t.open24h);
      return {
        instId: t.instId,
        symbol: t.instId.replace('-USDT-SWAP', ''),
        change24hPct: open > 0 ? ((last - open) / open) * 100 : 0,
        quoteVol24hUsd: Number.parseFloat(t.volCcy24h) * last,
      };
    })
    .filter((t) => t.change24hPct >= 3 && t.quoteVol24hUsd > 5_000_000)
    .sort((a, b) => b.change24hPct - a.change24hPct)
    .slice(0, 12);

  // Stage 2: shorts still paying (negative funding) into the rise.
  const withFunding = await Promise.all(
    rising.map(async (t) => {
      try {
        const f = await okxJson<Funding[]>(`/api/v5/public/funding-rate?instId=${t.instId}`, 300);
        return { ...t, fundingPct8h: Number.parseFloat(f[0].fundingRate) * 100 };
      } catch {
        return null;
      }
    }),
  );
  const negative = withFunding.filter(
    (t): t is NonNullable<typeof t> => t !== null && t.fundingPct8h <= -0.003,
  );

  // Stage 3: OI still building (shorts pressing, not covering).
  const fueled = await Promise.all(
    negative.slice(0, 8).map(async (t) => {
      try {
        const oi = await okxJson<OiRow[]>(
          `/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${t.symbol}&period=1H`,
          300,
        );
        const rows = [...oi].reverse().slice(-24);
        const oiChangePct = pct(
          Number.parseFloat(rows[0][1]),
          Number.parseFloat((rows.at(-1) as OiRow)[1]),
        );
        return { ...t, oiChange24hPct: oiChangePct };
      } catch {
        return { ...t, oiChange24hPct: null as number | null };
      }
    }),
  );

  const ranked = fueled
    .map((t) => ({
      symbol: t.symbol,
      change24hPct: round(t.change24hPct),
      fundingPct8h: round(t.fundingPct8h, 4),
      oiChange24hPct: t.oiChange24hPct === null ? null : round(t.oiChange24hPct),
      bucket: ((t.oiChange24hPct ?? 0) > 3
        ? 'primed'
        : (t.oiChange24hPct ?? 0) > 0
          ? 'building'
          : 'watch') as 'primed' | 'building' | 'watch',
    }))
    .sort((a, b) => (b.oiChange24hPct ?? -99) - (a.oiChange24hPct ?? -99));

  return Response.json({
    report: 'squeeze-watch',
    generatedAt: new Date().toISOString(),
    method:
      'OKX USDT swaps, three stages: price +3%+ over 24h with volume ≥ $5M → funding still ≤ −0.003%/8h (shorts PAYING into strength) → 24h OI build. Buckets: primed = OI > +3%; building = OI > 0; watch = OI flat/down (may be covering already). Squeeze fuel is measurable; squeeze timing is not — a screening aid, never leverage advice.',
    source: 'OKX public futures data',
    candidates: ranked,
    dataGaps: [],
    read:
      ranked.length === 0
        ? 'No perp shows squeeze fuel right now (rising price + negative funding) — shorts are not trapped anywhere obvious (that IS the read).'
        : `${ranked.length} squeeze candidate${ranked.length === 1 ? '' : 's'}: ${ranked.slice(0, 3).map((r) => `${r.symbol} (+${r.change24hPct}%, f ${r.fundingPct8h}%${r.oiChange24hPct !== null ? `, OI ${r.oiChange24hPct >= 0 ? '+' : ''}${r.oiChange24hPct}%` : ''})`).join(', ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
