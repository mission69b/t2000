import { okxJson, pct, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: washout screen (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Ticker = { instId: string; last: string; open24h: string; volCcy24h: string };
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

  // Stage 1: sharp 24h drop with real volume.
  const dropped = tickers
    .filter((t) => t.instId.endsWith('-USDT-SWAP'))
    .map((t) => {
      const last = Number.parseFloat(t.last);
      const open = Number.parseFloat(t.open24h);
      return {
        symbol: t.instId.replace('-USDT-SWAP', ''),
        change24hPct: open > 0 ? ((last - open) / open) * 100 : 0,
        quoteVol24hUsd: Number.parseFloat(t.volCcy24h) * last,
      };
    })
    .filter((t) => t.change24hPct <= -7 && t.quoteVol24hUsd > 3_000_000)
    .sort((a, b) => a.change24hPct - b.change24hPct)
    .slice(0, 8);

  // Stage 2: confirm deleveraging (24h OI collapse) on the shortlist.
  const confirmed = await Promise.all(
    dropped.map(async (t) => {
      try {
        const oi = await okxJson<OiRow[]>(
          `/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${t.symbol}&period=1H`,
          300,
        );
        const rows = [...oi].reverse().slice(-24);
        if (rows.length < 12) {
          return null;
        }
        const oiChangePct = pct(
          Number.parseFloat(rows[0][1]),
          Number.parseFloat((rows.at(-1) as OiRow)[1]),
        );
        return { ...t, oiChange24hPct: oiChangePct };
      } catch {
        return null;
      }
    }),
  );

  const washouts = confirmed
    .filter((t): t is NonNullable<typeof t> => t !== null && t.oiChange24hPct <= -5)
    .map((t) => ({
      symbol: t.symbol,
      change24hPct: round(t.change24hPct),
      oiChange24hPct: round(t.oiChange24hPct),
      quoteVol24hUsd: Math.round(t.quoteVol24hUsd),
      washoutScore: round(Math.abs(t.change24hPct) * 0.6 + Math.abs(t.oiChange24hPct) * 0.4, 1),
    }))
    .sort((a, b) => b.washoutScore - a.washoutScore);

  return Response.json({
    report: 'capitulation-scan',
    generatedAt: new Date().toISOString(),
    method:
      'OKX USDT swaps: stage 1 = 24h drop ≤ −7% with quote volume ≥ $3M; stage 2 = 24h open-interest collapse ≤ −5% (forced deleveraging, not just repricing). Score = 0.6×|drop| + 0.4×|OI collapse|. A snapshot — re-run every few hours; a deep flush does NOT guarantee a bounce, and this is explicitly not a buy list. Research context, not trade advice.',
    source: 'OKX public futures data',
    screened: tickers.length,
    washouts,
    dataGaps: [],
    read:
      washouts.length === 0
        ? 'No perp shows crash + deleverage together right now — no active washouts (that IS the read).'
        : `${washouts.length} active washout${washouts.length === 1 ? '' : 's'}: ${washouts.slice(0, 3).map((w) => `${w.symbol} (${w.change24hPct}% px, ${w.oiChange24hPct}% OI)`).join(', ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
