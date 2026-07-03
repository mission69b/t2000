import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: crypto sector rotation (§II.17 Shelf v3).
// Sold by the "Sector Radar" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → which sectors are leading and lagging over 24h among
// $1B+ categories, BTC dominance context, and a rotation classification
// (risk_on_rotation / btc_led / defensive / mixed). Sector data provided by
// CoinGecko (attributed, integrated). No input needed.
export const dynamic = 'force-dynamic';

const CG = 'https://api.coingecko.com/api/v3';
const MIN_SECTOR_MCAP_USD = 1_000_000_000;
// Meta-categories that mirror the whole market rather than a sector.
const EXCLUDED = new Set([
  'smart-contract-platform',
  'layer-1',
  'proof-of-work-pow',
  'proof-of-stake-pos',
  'ftx-holdings',
  'alameda-research-portfolio',
  'multicoin-capital-portfolio',
  'ecosystem',
]);

type Category = {
  id: string;
  name: string;
  market_cap: number | null;
  market_cap_change_24h: number | null;
  volume_24h: number | null;
};

type Global = {
  data?: {
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
  };
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CG}${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    throw new Error(`CoinGecko ${path.split('?')[0]} ${res.status}`);
  }
  return (await res.json()) as T;
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [catsR, globalR] = await Promise.allSettled([
    getJson<Category[]>('/coins/categories'),
    getJson<Global>('/global'),
  ]);

  if (catsR.status === 'rejected') {
    return Response.json(
      { error: 'Sector data unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const gaps: string[] = [];
  const global = globalR.status === 'fulfilled' ? globalR.value.data : undefined;
  if (!global) {
    gaps.push('global market lane (BTC dominance) unavailable');
  }

  const sectors = catsR.value
    .filter(
      (c) =>
        (c.market_cap ?? 0) >= MIN_SECTOR_MCAP_USD &&
        c.market_cap_change_24h !== null &&
        !EXCLUDED.has(c.id) &&
        !c.id.includes('portfolio') &&
        !c.id.includes('ecosystem'),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      marketCapUsd: Math.round(c.market_cap as number),
      change24hPct: Number((c.market_cap_change_24h as number).toFixed(2)),
      volume24hUsd: c.volume_24h === null ? null : Math.round(c.volume_24h),
    }));

  if (sectors.length < 5) {
    return Response.json(
      { error: 'Too few qualifying sectors in the dataset. Nothing was read.' },
      { status: 502 },
    );
  }

  const byChange = [...sectors].sort((a, b) => b.change24hPct - a.change24hPct);
  const leaders = byChange.slice(0, 5);
  const laggards = byChange.slice(-5).reverse();
  const pctPositive = Math.round(
    (sectors.filter((s) => s.change24hPct > 0).length / sectors.length) * 100,
  );

  const btcDom = global?.market_cap_percentage?.btc ?? null;
  const marketChange24h = global?.market_cap_change_percentage_24h_usd ?? null;

  // Classification — deterministic, disclosed thresholds.
  let rotation: 'risk_on_rotation' | 'btc_led' | 'defensive' | 'mixed';
  if (pctPositive >= 65 && (marketChange24h ?? 0) > 0) {
    rotation = 'risk_on_rotation';
  } else if ((marketChange24h ?? 0) > 0 && pctPositive < 45) {
    rotation = 'btc_led';
  } else if ((marketChange24h ?? 0) < -2 && pctPositive <= 30) {
    rotation = 'defensive';
  } else {
    rotation = 'mixed';
  }

  return Response.json({
    report: 'sector-radar',
    generatedAt: new Date().toISOString(),
    method:
      `Categories with ≥$1B market cap (meta/portfolio/ecosystem buckets excluded), ranked by 24h market-cap change; breadth = % of qualifying sectors positive. Rotation: risk_on_rotation = breadth ≥ 65% ∧ market up; btc_led = market up ∧ breadth < 45%; defensive = market < −2% ∧ breadth ≤ 30%; else mixed. ${sectors.length} sectors qualified. Research context, not trade advice.`,
    source: 'Sector data provided by CoinGecko (https://www.coingecko.com/en/api)',
    rotation,
    evidence: {
      sectorsTracked: sectors.length,
      pctSectorsPositive24h: pctPositive,
      btcDominancePct: btcDom === null ? null : Number(btcDom.toFixed(1)),
      totalMarketChange24hPct:
        marketChange24h === null ? null : Number(marketChange24h.toFixed(2)),
      leaders,
      laggards,
    },
    dataGaps: gaps,
    read: `${leaders[0].name} leads (${leaders[0].change24hPct >= 0 ? '+' : ''}${leaders[0].change24hPct}% 24h), ${laggards[0].name} lags (${laggards[0].change24hPct}%); ${pctPositive}% of $1B+ sectors are green${btcDom !== null ? `, BTC dominance ${btcDom.toFixed(1)}%` : ''} → ${rotation.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
