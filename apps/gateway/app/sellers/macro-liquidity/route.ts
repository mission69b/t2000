import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: macro liquidity monitor (§II.17 Shelf v2).
// Sold by the "Macro Liquidity" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → a derived read on US-dollar liquidity for crypto risk appetite:
// Fed balance sheet (WALCL), reverse repo (RRPONTSYD), Treasury General
// Account (WTREGEN) → net-liquidity direction + a supportive / neutral /
// restrictive classification. Source: FRED keyless CSV (public-domain US
// government data — no license constraints). Missing series are reported as
// explicit gaps, never synthesized.
export const dynamic = 'force-dynamic';

const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
// ~10 weeks of history is enough for the 4-week deltas with weekly series.
const LOOKBACK_DAYS = 70;

type Point = { date: string; value: number };

async function fredSeries(id: string): Promise<Point[]> {
  const start = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const res = await fetch(`${FRED}?id=${id}&cosd=${start}`, {
    headers: { accept: 'text/csv' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`FRED ${id} ${res.status}`);
  }
  const text = await res.text();
  const points: Point[] = [];
  for (const line of text.split('\n').slice(1)) {
    const [date, raw] = line.trim().split(',');
    const value = Number.parseFloat(raw ?? '');
    if (date && Number.isFinite(value)) {
      points.push({ date, value });
    }
  }
  if (points.length === 0) {
    throw new Error(`FRED ${id} returned no observations`);
  }
  return points;
}

function latest(points: Point[]): Point {
  return points.at(-1) as Point;
}

/** Change between the latest observation and the one closest to `days` ago. */
function deltaOver(points: Point[], days: number): number {
  const last = latest(points);
  const target = Date.parse(last.date) - days * 86_400_000;
  let ref = points[0];
  for (const p of points) {
    if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) {
      ref = p;
    }
  }
  return last.value - ref.value;
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  // Fetch the three lanes independently — a failed lane becomes an explicit
  // gap (partial read), not a fabricated number. All three failing → 502
  // (the delivery leg auto-refunds the buyer).
  const [walcl, rrp, tga] = await Promise.allSettled([
    fredSeries('WALCL'), // Fed balance sheet, $M, weekly
    fredSeries('RRPONTSYD'), // ON reverse repo, $B, daily
    fredSeries('WTREGEN'), // Treasury General Account, $M, weekly
  ]);

  const gaps: string[] = [];
  const fed = walcl.status === 'fulfilled' ? walcl.value : null;
  const repo = rrp.status === 'fulfilled' ? rrp.value : null;
  const treasury = tga.status === 'fulfilled' ? tga.value : null;
  if (!fed) {
    gaps.push('WALCL (Fed balance sheet) unavailable');
  }
  if (!repo) {
    gaps.push('RRPONTSYD (reverse repo) unavailable');
  }
  if (!treasury) {
    gaps.push('WTREGEN (Treasury General Account) unavailable');
  }
  if (!(fed || repo || treasury)) {
    return Response.json(
      { error: 'All FRED liquidity series unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  // Units: WALCL + WTREGEN are $M; RRPONTSYD is $B. Normalize to $B.
  const fedB = fed ? { level: latest(fed).value / 1000, d28: deltaOver(fed, 28) / 1000 } : null;
  const rrpB = repo ? { level: latest(repo).value, d28: deltaOver(repo, 28) } : null;
  const tgaB = treasury
    ? { level: latest(treasury).value / 1000, d28: deltaOver(treasury, 28) / 1000 }
    : null;

  // Net liquidity ≈ Fed balance sheet − TGA − RRP. Rising = dollars pushed
  // toward risk assets; falling = drained. Direction needs all three lanes.
  const netDelta28 =
    fedB && rrpB && tgaB ? fedB.d28 - rrpB.d28 - tgaB.d28 : null;

  let classification: 'supportive' | 'restrictive' | 'neutral' | 'partial';
  if (netDelta28 === null) {
    classification = 'partial';
  } else if (netDelta28 > 40) {
    classification = 'supportive';
  } else if (netDelta28 < -40) {
    classification = 'restrictive';
  } else {
    classification = 'neutral';
  }

  return Response.json({
    report: 'macro-liquidity',
    generatedAt: new Date().toISOString(),
    method:
      'Net liquidity ≈ Fed balance sheet (WALCL) − Treasury General Account (WTREGEN) − ON reverse repo (RRPONTSYD); 28-day deltas; supportive > +$40B, restrictive < −$40B, else neutral. Weekly series lag a few days. Research context, not trade advice.',
    source: 'FRED, Federal Reserve Bank of St. Louis (public-domain US government data)',
    classification,
    netLiquidityDelta28dBillionUsd:
      netDelta28 === null ? null : Number(netDelta28.toFixed(1)),
    lanes: {
      fedBalanceSheet: fedB
        ? {
            levelBillionUsd: Number(fedB.level.toFixed(1)),
            delta28dBillionUsd: Number(fedB.d28.toFixed(1)),
            asOf: latest(fed as Point[]).date,
          }
        : null,
      reverseRepo: rrpB
        ? {
            levelBillionUsd: Number(rrpB.level.toFixed(1)),
            delta28dBillionUsd: Number(rrpB.d28.toFixed(1)),
            asOf: latest(repo as Point[]).date,
          }
        : null,
      treasuryGeneralAccount: tgaB
        ? {
            levelBillionUsd: Number(tgaB.level.toFixed(1)),
            delta28dBillionUsd: Number(tgaB.d28.toFixed(1)),
            asOf: latest(treasury as Point[]).date,
          }
        : null,
    },
    dataGaps: gaps,
    read:
      netDelta28 === null
        ? 'Partial read — a core series is unavailable; no classification synthesized.'
        : `Net liquidity ${netDelta28 > 0 ? 'rose' : netDelta28 < 0 ? 'fell' : 'was flat'} ~$${Math.abs(netDelta28).toFixed(0)}B over the last 4 weeks — ${classification} for crypto risk appetite. RRP ${rrpB && rrpB.d28 < 0 ? 'draining (cash leaving the Fed parking lot)' : 'building'}; TGA ${tgaB && tgaB.d28 > 0 ? 'rebuilding (drains liquidity)' : 'drawing down (adds liquidity)'}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
