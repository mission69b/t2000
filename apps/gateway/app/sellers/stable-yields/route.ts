import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: stablecoin yield report (§II.13.B).
// Sold by the "Stable Yields" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → the best stablecoin APYs across DeFi (DefiLlama yields feed,
// keyless), TVL-floored so the list is farmable size, split into blue-chip
// (battle-tested lenders) vs everything-else, with per-chain bests.
export const dynamic = 'force-dynamic';

const SOURCE = 'https://yields.llama.fi/pools';
const MIN_TVL_USD = 10_000_000;
const TOP_N = 12;

// Battle-tested lending/AMM protocols — the "boring is beautiful" shelf.
const BLUE_CHIP = new Set([
  'aave-v3',
  'aave-v2',
  'compound-v3',
  'morpho-blue',
  'morpho-aave',
  'spark',
  'fluid-lending',
  'curve-dex',
  'maker',
  'sky-lending',
  'justlend',
  'kamino-lend',
  'save',
  'suilend',
  'navi-lending',
]);

type Pool = {
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
  poolMeta?: string | null;
};

function row(p: Pool) {
  return {
    project: p.project,
    chain: p.chain,
    symbol: p.symbol,
    ...(p.poolMeta ? { note: p.poolMeta } : {}),
    apyPct: Number((p.apy ?? 0).toFixed(2)),
    apyBasePct: p.apyBase == null ? null : Number(p.apyBase.toFixed(2)),
    apyRewardPct: p.apyReward == null ? null : Number(p.apyReward.toFixed(2)),
    tvlUsd: Math.round(p.tvlUsd),
  };
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired(
      '0x9af2e1821b7dad818d288f1cc2248c1ccf1e535b3a55ef7b742ea379664ca101',
    );
  }

  let pools: Pool[];
  try {
    const res = await fetch(SOURCE, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }
    pools = ((await res.json()) as { data: Pool[] }).data;
  } catch (err) {
    // Non-2xx → the delivery leg auto-refunds the buyer. Honest failure.
    return Response.json(
      { error: `Yield data unavailable: ${err instanceof Error ? err.message : 'fetch failed'}` },
      { status: 502 },
    );
  }

  const eligible = pools
    .filter(
      (p) =>
        p.stablecoin === true &&
        (p.tvlUsd ?? 0) >= MIN_TVL_USD &&
        p.apy != null &&
        p.apy > 0 &&
        p.ilRisk !== 'yes',
    )
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));

  const blueChip = eligible.filter((p) => BLUE_CHIP.has(p.project));
  const bestPerChain = new Map<string, Pool>();
  for (const p of eligible) {
    if (!bestPerChain.has(p.chain)) {
      bestPerChain.set(p.chain, p);
    }
  }

  return Response.json({
    report: 'stablecoin-yields',
    generatedAt: new Date().toISOString(),
    method:
      'DefiLlama yields feed; stablecoin pools only; TVL ≥ $10M; no impermanent-loss pools. High headline APY usually means reward-token emissions or newer protocols — check apyBasePct for the organic rate. Blue-chip = long-lived lending/AMM protocols. NOT financial advice.',
    poolsScanned: pools.length,
    eligible: eligible.length,
    topOverall: eligible.slice(0, TOP_N).map(row),
    topBlueChip: blueChip.slice(0, TOP_N).map(row),
    bestPerChain: [...bestPerChain.values()].slice(0, 15).map(row),
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
