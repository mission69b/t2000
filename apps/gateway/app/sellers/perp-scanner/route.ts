import { okxJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: perp universe triage (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Ticker = {
  instId: string;
  last: string;
  open24h: string;
  volCcy24h: string;
};
type Funding = { fundingRate: string };

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

  const usdt = tickers
    .filter((t) => t.instId.endsWith('-USDT-SWAP'))
    .map((t) => {
      const last = Number.parseFloat(t.last);
      const open = Number.parseFloat(t.open24h);
      const quoteVol = Number.parseFloat(t.volCcy24h) * last;
      return {
        instId: t.instId,
        symbol: t.instId.replace('-USDT-SWAP', ''),
        last,
        change24hPct: open > 0 ? ((last - open) / open) * 100 : 0,
        quoteVol24hUsd: quoteVol,
      };
    })
    .filter((t) => t.quoteVol24hUsd > 5_000_000);

  // Move-adjusted-for-liquidity score; funding fetched for the shortlist only.
  const scored = usdt
    .map((t) => ({
      ...t,
      score: Math.abs(t.change24hPct) * Math.log10(Math.max(t.quoteVol24hUsd, 10)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const gaps: string[] = [];
  const withFunding = await Promise.all(
    scored.map(async (t) => {
      try {
        const f = await okxJson<Funding[]>(
          `/api/v5/public/funding-rate?instId=${t.instId}`,
          300,
        );
        return { ...t, fundingPct8h: round(Number.parseFloat(f[0].fundingRate) * 100, 4) };
      } catch {
        return { ...t, fundingPct8h: null };
      }
    }),
  );
  if (withFunding.some((t) => t.fundingPct8h === null)) {
    gaps.push('funding lane unavailable for some names');
  }

  const rows = withFunding.map((t, i) => ({
    rank: i + 1,
    symbol: t.symbol,
    change24hPct: round(t.change24hPct),
    quoteVol24hUsd: Math.round(t.quoteVol24hUsd),
    fundingPct8h: t.fundingPct8h,
    bucket: (i < 4 ? 'immediate' : i < 8 ? 'secondary' : 'watchlist') as
      | 'immediate'
      | 'secondary'
      | 'watchlist',
  }));

  return Response.json({
    report: 'perp-scanner',
    generatedAt: new Date().toISOString(),
    method:
      `OKX USDT swaps (volume floor $5M): triage score = |24h change| × log10(quote volume); top-12 ranked with live funding attached; buckets = immediate (top 4) / secondary / watchlist. A review queue for deeper single-name work (Perp Pressure), not an execution plan. ${usdt.length} markets screened. Research context, not trade advice.`,
    source: 'OKX public futures data',
    marketsScreened: usdt.length,
    candidates: rows,
    dataGaps: gaps,
    read: `Top of the queue: ${rows.slice(0, 3).map((r) => `${r.symbol} (${r.change24hPct >= 0 ? '+' : ''}${r.change24hPct}%${r.fundingPct8h !== null ? `, f ${r.fundingPct8h >= 0 ? '+' : ''}${r.fundingPct8h}%` : ''})`).join(', ')} of ${usdt.length} screened.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
