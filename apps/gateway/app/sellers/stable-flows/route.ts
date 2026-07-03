import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: stablecoin supply flows (§II.17 Shelf v3).
// Sold by the "Stable Flows" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → whether stablecoin supply (crypto's cash on the sidelines) is
// expanding, flat, or contracting: aggregate 7d/30d deltas, the top-5 stables
// with per-asset flows and peg deviation, and a peg-stress flag. Derived from
// DefiLlama's open stablecoins dataset. No input needed.
export const dynamic = 'force-dynamic';

const SOURCE = 'https://stablecoins.llama.fi/stablecoins?includePrices=true';
const PEG_STRESS_BPS = 50;

type PeggedAsset = {
  name: string;
  symbol: string;
  pegType: string;
  price?: number | string | null;
  circulating?: { peggedUSD?: number };
  circulatingPrevWeek?: { peggedUSD?: number };
  circulatingPrevMonth?: { peggedUSD?: number };
};

function usd(n: number): number {
  return Math.round(n);
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let assets: PeggedAsset[];
  try {
    const res = await fetch(SOURCE, {
      headers: { accept: 'application/json' },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      throw new Error(`DefiLlama stablecoins ${res.status}`);
    }
    assets = ((await res.json()) as { peggedAssets?: PeggedAsset[] }).peggedAssets ?? [];
  } catch {
    return Response.json(
      { error: 'Stablecoin supply data unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const usdPegged = assets.filter(
    (a) => a.pegType === 'peggedUSD' && (a.circulating?.peggedUSD ?? 0) > 0,
  );
  if (usdPegged.length === 0) {
    return Response.json(
      { error: 'Stablecoin dataset returned no USD-pegged assets. Nothing was read.' },
      { status: 502 },
    );
  }

  const sum = (pick: (a: PeggedAsset) => number | undefined) =>
    usdPegged.reduce((acc, a) => acc + (pick(a) ?? 0), 0);

  const totalNow = sum((a) => a.circulating?.peggedUSD);
  const totalWeek = sum((a) => a.circulatingPrevWeek?.peggedUSD);
  const totalMonth = sum((a) => a.circulatingPrevMonth?.peggedUSD);
  const d7Pct = totalWeek > 0 ? ((totalNow - totalWeek) / totalWeek) * 100 : null;
  const d30Pct = totalMonth > 0 ? ((totalNow - totalMonth) / totalMonth) * 100 : null;

  const top = [...usdPegged]
    .sort((a, b) => (b.circulating?.peggedUSD ?? 0) - (a.circulating?.peggedUSD ?? 0))
    .slice(0, 5)
    .map((a) => {
      const now = a.circulating?.peggedUSD ?? 0;
      const week = a.circulatingPrevWeek?.peggedUSD ?? 0;
      const month = a.circulatingPrevMonth?.peggedUSD ?? 0;
      const price = a.price === null || a.price === undefined ? null : Number(a.price);
      const pegDeviationBps =
        price === null || Number.isNaN(price) ? null : Math.round((price - 1) * 10_000);
      return {
        symbol: a.symbol,
        name: a.name,
        supplyUsd: usd(now),
        change7dPct: week > 0 ? Number((((now - week) / week) * 100).toFixed(2)) : null,
        change30dPct: month > 0 ? Number((((now - month) / month) * 100).toFixed(2)) : null,
        pegDeviationBps,
      };
    });

  const stressed = top.filter(
    (t) => t.pegDeviationBps !== null && Math.abs(t.pegDeviationBps) > PEG_STRESS_BPS,
  );

  // Classification — deterministic, disclosed thresholds on the 30d delta.
  let flow: 'expanding' | 'flat' | 'contracting';
  if (d30Pct !== null && d30Pct > 1) {
    flow = 'expanding';
  } else if (d30Pct !== null && d30Pct < -1) {
    flow = 'contracting';
  } else {
    flow = 'flat';
  }

  return Response.json({
    report: 'stable-flows',
    generatedAt: new Date().toISOString(),
    method:
      'All USD-pegged stablecoins (DefiLlama open dataset): aggregate circulating supply now vs 7d/30d ago; top-5 by supply with per-asset deltas; peg deviation = live price vs $1.00 in bps (stress flag beyond ±50bps). Flow = expanding (30d > +1%), contracting (30d < −1%), else flat. Supply growth ≈ net cash entering crypto. Research context, not trade advice.',
    source: 'DefiLlama stablecoins API (open)',
    flow,
    pegStress: stressed.length > 0,
    evidence: {
      totalSupplyUsd: usd(totalNow),
      change7dPct: d7Pct === null ? null : Number(d7Pct.toFixed(2)),
      change30dPct: d30Pct === null ? null : Number(d30Pct.toFixed(2)),
      change30dUsd: totalMonth > 0 ? usd(totalNow - totalMonth) : null,
      trackedAssets: usdPegged.length,
      top5: top,
      offPeg: stressed.map((t) => ({ symbol: t.symbol, pegDeviationBps: t.pegDeviationBps })),
    },
    dataGaps: [],
    read: `Stablecoin supply is ${flow} — $${(totalNow / 1e9).toFixed(1)}B total, ${d30Pct === null ? 'n/a' : `${d30Pct >= 0 ? '+' : ''}${d30Pct.toFixed(1)}%`} over 30d${stressed.length > 0 ? `; PEG STRESS: ${stressed.map((t) => t.symbol).join(', ')} beyond ±${PEG_STRESS_BPS}bps` : '; all top-5 pegs holding'}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
