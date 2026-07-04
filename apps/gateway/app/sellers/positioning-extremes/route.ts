import { okxJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: crowd-positioning extremes (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

const UNIVERSE = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'SUI', 'BNB', 'LTC', 'ADA', 'AVAX', 'LINK', 'TON'];

type RatioRow = [string, string];
type Funding = { fundingRate: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  // OKX rubik endpoints rate-limit tighter than the market ones — fetch in
  // batches of 4 (S.624 smoke finding: 12 parallel calls dropped 5 lanes).
  const rows: ({
    symbol: string;
    longShortRatio: number;
    longSharePct: number;
    fundingPct8h: number;
    extremity: number;
  } | null)[] = [];
  for (let i = 0; i < UNIVERSE.length; i += 4) {
    const batch = await Promise.all(
      UNIVERSE.slice(i, i + 4).map(async (symbol) => {
        try {
          const [ratioRows, funding] = await Promise.all([
            okxJson<RatioRow[]>(
              `/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${symbol}&period=1H`,
              300,
            ),
            okxJson<Funding[]>(`/api/v5/public/funding-rate?instId=${symbol}-USDT-SWAP`, 300),
          ]);
          const ratio = Number.parseFloat(ratioRows[0][1]);
          const longShare = ratio / (1 + ratio);
          return {
            symbol,
            longShortRatio: round(ratio),
            longSharePct: round(longShare * 100, 1),
            fundingPct8h: round(Number.parseFloat(funding[0].fundingRate) * 100, 4),
            extremity: round(Math.abs(longShare - 0.5) * 200, 1), // 0 = balanced, 100 = one-sided
          };
        } catch {
          return null;
        }
      }),
    );
    rows.push(...batch);
  }

  const got = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (got.length < 6) {
    return upstreamDown('Positioning data (too few markets responded)');
  }
  const gaps = UNIVERSE.filter((s) => !got.some((g) => g.symbol === s)).map(
    (s) => `${s} lane unavailable`,
  );

  const ranked = [...got].sort((a, b) => b.extremity - a.extremity);
  const crowded = ranked.filter((r) => r.longSharePct >= 62 || r.longSharePct <= 45);

  return Response.json({
    report: 'positioning-extremes',
    generatedAt: new Date().toISOString(),
    method:
      `OKX account long/short ratios across ${UNIVERSE.length} majors, latest 1H point, funding attached as the confirmation lane. Extremity = |long share − 50%| × 2 (0 balanced → 100 one-sided); crowded = long share ≥ 62% or ≤ 45%. Extremes resolve violently — this locates them, it does not time them. Research context, not trade advice.`,
    source: 'OKX public futures data',
    markets: ranked,
    crowdedCount: crowded.length,
    dataGaps: gaps,
    read:
      crowded.length === 0
        ? 'No major shows crowded account positioning right now — a balanced book (that IS the read).'
        : `Most one-sided: ${ranked.slice(0, 3).map((r) => `${r.symbol} (${r.longSharePct}% long, f ${r.fundingPct8h >= 0 ? '+' : ''}${r.fundingPct8h}%)`).join(', ')} — ${crowded.length} of ${got.length} majors read crowded.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
