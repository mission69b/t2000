import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: DEX activity pulse (§II.17 Shelf v3).
// Sold by the "DEX Pulse" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → whether on-chain spot activity is heating up or cooling:
// aggregate 24h DEX volume with 1d/7d deltas, the top venues, and volume
// concentration. Derived from DefiLlama's open DEX dataset. No input needed.
export const dynamic = 'force-dynamic';

const SOURCE =
  'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';

type Protocol = {
  name: string;
  total24h: number | null;
  change_1d: number | null;
  change_7d: number | null;
  chains?: string[];
};

type Overview = {
  total24h?: number;
  change_1d?: number;
  change_7d?: number;
  protocols?: Protocol[];
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let data: Overview;
  try {
    const res = await fetch(SOURCE, {
      headers: { accept: 'application/json' },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      throw new Error(`DefiLlama dexs ${res.status}`);
    }
    data = (await res.json()) as Overview;
  } catch {
    return Response.json(
      { error: 'DEX volume data unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const protocols = (data.protocols ?? []).filter((p) => (p.total24h ?? 0) > 0);
  if (protocols.length === 0) {
    return Response.json(
      { error: 'DEX dataset returned no active venues. Nothing was read.' },
      { status: 502 },
    );
  }

  const total24h = data.total24h ?? protocols.reduce((a, p) => a + (p.total24h ?? 0), 0);
  const change1d = data.change_1d ?? null;
  const change7d = data.change_7d ?? null;

  const top = [...protocols]
    .sort((a, b) => (b.total24h as number) - (a.total24h as number))
    .slice(0, 8)
    .map((p) => ({
      name: p.name,
      volume24hUsd: Math.round(p.total24h as number),
      sharePct: Number((((p.total24h as number) / total24h) * 100).toFixed(1)),
      change1dPct: p.change_1d === null ? null : Number(p.change_1d.toFixed(1)),
      change7dPct: p.change_7d === null ? null : Number(p.change_7d.toFixed(1)),
      chains: (p.chains ?? []).slice(0, 4),
    }));
  const top5SharePct = Number(
    top.slice(0, 5).reduce((a, t) => a + t.sharePct, 0).toFixed(1),
  );

  // Classification — deterministic, disclosed thresholds on the 1d delta
  // corroborated by the 7d trend.
  let activity: 'heating_up' | 'cooling' | 'steady';
  if ((change1d ?? 0) > 10 && (change7d ?? 0) > 0) {
    activity = 'heating_up';
  } else if ((change1d ?? 0) < -10 && (change7d ?? 0) < 0) {
    activity = 'cooling';
  } else {
    activity = 'steady';
  }

  return Response.json({
    report: 'dex-pulse',
    generatedAt: new Date().toISOString(),
    method:
      'All tracked DEXs (DefiLlama open dataset): aggregate 24h spot volume with 1d/7d deltas; top venues by volume with share; concentration = top-5 share. Activity: heating_up = 1d > +10% ∧ 7d > 0; cooling = 1d < −10% ∧ 7d < 0; else steady. On-chain spot volume ≈ real risk appetite (no perps, no CEX). Research context, not trade advice.',
    source: 'DefiLlama DEX overview API (open)',
    activity,
    evidence: {
      totalVolume24hUsd: Math.round(total24h),
      change1dPct: change1d === null ? null : Number(change1d.toFixed(1)),
      change7dPct: change7d === null ? null : Number(change7d.toFixed(1)),
      venuesTracked: protocols.length,
      top5ConcentrationPct: top5SharePct,
      topVenues: top,
    },
    dataGaps: [],
    read: `DEX spot volume is ${activity.replace('_', ' ')} — $${(total24h / 1e9).toFixed(2)}B in 24h (${change1d === null ? 'n/a' : `${change1d >= 0 ? '+' : ''}${change1d.toFixed(1)}%`} d/d), led by ${top[0].name} at ${top[0].sharePct}%; top-5 venues hold ${top5SharePct}%.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
