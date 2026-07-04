import { callSibling } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: the composite morning read (S.624 Shelf v4).
// Five sibling lanes, one brief — each lane's own classification is shown,
// a failed lane becomes an explicit gap.
export const dynamic = 'force-dynamic';

type MoodLane = { mood?: string; read?: string };
type RegimeLane = { regime?: string; read?: string };
type LiquidityLane = { classification?: string; read?: string };
type SectorLane = { rotation?: string; read?: string };
type MoversLane = { breadthPctPositive24h?: number; read?: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [moodR, regimeR, liqR, sectorR, moversR] = await Promise.allSettled([
    callSibling<MoodLane>(req, 'market-mood'),
    callSibling<RegimeLane>(req, 'market-regime'),
    callSibling<LiquidityLane>(req, 'macro-liquidity'),
    callSibling<SectorLane>(req, 'sector-radar'),
    callSibling<MoversLane>(req, 'top-movers'),
  ]);

  const gaps: string[] = [];
  const lane = <T>(r: PromiseSettledResult<T>, name: string): T | null => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    gaps.push(`${name} lane unavailable`);
    return null;
  };
  const mood = lane(moodR, 'sentiment');
  const regime = lane(regimeR, 'regime');
  const liq = lane(liqR, 'liquidity');
  const sector = lane(sectorR, 'sectors');
  const movers = lane(moversR, 'movers');

  const available = [mood, regime, liq, sector, movers].filter(Boolean).length;
  if (available < 3) {
    return Response.json(
      { error: `Only ${available}/5 lanes available — not enough for an honest brief.` },
      { status: 502 },
    );
  }

  // Composite risk posture: count supportive vs hostile lane states.
  let score = 0;
  let counted = 0;
  const tally = (v: boolean | null) => {
    if (v !== null) {
      score += v ? 1 : -1;
      counted++;
    }
  };
  tally(mood ? ['greedy_expansion', 'fearful_stabilizing'].includes(mood.mood ?? '') : null);
  tally(regime ? regime.regime === 'trend_expansion' : null);
  tally(liq ? liq.classification === 'supportive' : null);
  tally(sector ? sector.rotation === 'risk_on_rotation' : null);
  tally(movers ? (movers.breadthPctPositive24h ?? 0) >= 55 : null);
  const posture =
    score >= 2 ? 'constructive' : score <= -2 ? 'defensive' : 'selective';

  return Response.json({
    report: 'daily-brief',
    generatedAt: new Date().toISOString(),
    method:
      'Five lanes, each a full report from this store (their methods disclosed there): sentiment (Market Mood), regime (Market Regime), dollar liquidity (Macro Liquidity), sector rotation (Sector Radar), movers + breadth (Top Movers). Posture = supportive-vs-hostile lane tally (constructive ≥ +2, defensive ≤ −2, else selective). Research context, not trade advice.',
    source:
      'CoinMarketCap · NY Fed · Treasury FiscalData · Binance/OKX public data · CoinGecko (per lane)',
    posture,
    lanes: {
      sentiment: mood ? { state: mood.mood, read: mood.read } : null,
      regime: regime ? { state: regime.regime, read: regime.read } : null,
      liquidity: liq ? { state: liq.classification, read: liq.read } : null,
      sectors: sector ? { state: sector.rotation, read: sector.read } : null,
      movers: movers
        ? { breadthPctPositive24h: movers.breadthPctPositive24h, read: movers.read }
        : null,
    },
    dataGaps: gaps,
    read: `Morning read: ${[
      mood ? `sentiment ${String(mood.mood).replace(/_/g, ' ')}` : null,
      regime ? `regime ${String(regime.regime).replace(/_/g, ' ')}` : null,
      liq ? `liquidity ${liq.classification}` : null,
      sector ? `sectors ${String(sector.rotation).replace(/_/g, ' ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ')} → ${posture} posture (${counted} lanes tallied).`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
