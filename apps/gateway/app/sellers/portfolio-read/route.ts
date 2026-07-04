import { callSibling, cmcJson, round } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: caller-supplied portfolio risk read (S.624 Shelf v4).
// Nothing is fetched about the caller; holdings arrive in the request and are
// not stored.
export const dynamic = 'force-dynamic';

const STABLES = new Set(['USDT', 'USDC', 'USDS', 'USDE', 'DAI', 'FDUSD', 'USDSUI']);

type Holding = { symbol: string; weightPct: number };
type Quote = {
  quote: { USD: { percent_change_30d: number } };
};
type RegimeLane = { regime?: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let holdings: Holding[] = [];
  try {
    const body = (await req.json()) as { holdings?: Holding[] };
    holdings = (body.holdings ?? []).filter(
      (h) =>
        typeof h?.symbol === 'string' &&
        /^[A-Z0-9]{2,10}$/i.test(h.symbol) &&
        typeof h?.weightPct === 'number' &&
        h.weightPct > 0,
    );
  } catch {
    holdings = [];
  }
  if (holdings.length === 0) {
    return Response.json(
      {
        error:
          'Pass your holdings: {"holdings":[{"symbol":"BTC","weightPct":50},{"symbol":"SUI","weightPct":30},{"symbol":"USDC","weightPct":20}]}. Weights are % of portfolio value.',
      },
      { status: 400 },
    );
  }

  const totalWeight = holdings.reduce((a, h) => a + h.weightPct, 0);
  const norm = holdings
    .map((h) => ({ symbol: h.symbol.toUpperCase(), weightPct: (h.weightPct / totalWeight) * 100 }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const gaps: string[] = [];
  const stableWeight = norm
    .filter((h) => STABLES.has(h.symbol))
    .reduce((a, h) => a + h.weightPct, 0);
  const volatile = norm.filter((h) => !STABLES.has(h.symbol));
  const top1 = norm[0];
  const top3Weight = norm.slice(0, 3).reduce((a, h) => a + h.weightPct, 0);

  // 30d performance of the volatile legs (context lane).
  let perf30d: Record<string, number> | null = null;
  if (volatile.length > 0) {
    try {
      const data = (
        await cmcJson<{ data: Record<string, Quote[]> }>(
          `/v2/cryptocurrency/quotes/latest?symbol=${volatile.map((h) => h.symbol).join(',')}&skip_invalid=true`,
        )
      ).data;
      perf30d = Object.fromEntries(
        volatile
          .filter((h) => data[h.symbol]?.[0])
          .map((h) => [h.symbol, round(data[h.symbol][0].quote.USD.percent_change_30d)]),
      );
    } catch {
      gaps.push('30d performance lane unavailable');
    }
  }

  let regime: string | null = null;
  try {
    regime = (await callSibling<RegimeLane>(req, 'market-regime')).regime ?? null;
  } catch {
    gaps.push('regime lane unavailable');
  }

  const concentration =
    top1.weightPct >= 50 ? 'concentrated' : top3Weight >= 80 ? 'top_heavy' : 'diversified';
  const posture =
    stableWeight >= 40 ? 'defensive' : stableWeight >= 15 ? 'balanced' : 'fully_risk_on';

  return Response.json({
    report: 'portfolio-read',
    generatedAt: new Date().toISOString(),
    method:
      'Caller-supplied holdings (normalized to 100%): concentration = top-position ≥ 50% concentrated, top-3 ≥ 80% top_heavy, else diversified; posture by stable weight (defensive ≥ 40%, balanced ≥ 15%, else fully_risk_on); 30d performance per volatile leg + the current market regime as exposure context. Holdings are processed in-request and NOT stored. Research context, not allocation advice.',
    source: 'Market data provided by CoinMarketCap · regime lane from this store',
    concentration,
    posture,
    evidence: {
      positions: norm.map((h) => ({
        symbol: h.symbol,
        weightPct: round(h.weightPct, 1),
        isStable: STABLES.has(h.symbol),
        change30dPct: perf30d?.[h.symbol] ?? null,
      })),
      topPositionPct: round(top1.weightPct, 1),
      top3Pct: round(top3Weight, 1),
      stableWeightPct: round(stableWeight, 1),
      currentRegime: regime,
    },
    dataGaps: gaps,
    read: `${norm.length} positions: ${top1.symbol} is ${round(top1.weightPct, 0)}% (${concentration.replace(/_/g, ' ')}), stables ${round(stableWeight, 0)}% (${posture.replace(/_/g, ' ')})${regime ? `, current regime ${regime.replace(/_/g, ' ')}` : ''}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
