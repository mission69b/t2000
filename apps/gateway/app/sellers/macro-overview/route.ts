import { callSibling } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: crypto-macro composite (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type LiquidityLane = { classification?: string; read?: string };
type FlowsLane = { flow?: string; pegStress?: boolean; read?: string };
type DomLane = { rotation?: string; read?: string };
type MoodLane = { mood?: string; read?: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [liqR, flowsR, domR, moodR] = await Promise.allSettled([
    callSibling<LiquidityLane>(req, 'macro-liquidity'),
    callSibling<FlowsLane>(req, 'stable-flows'),
    callSibling<DomLane>(req, 'dominance-shifts'),
    callSibling<MoodLane>(req, 'market-mood'),
  ]);

  const gaps: string[] = [];
  const lane = <T>(r: PromiseSettledResult<T>, name: string): T | null => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    gaps.push(`${name} lane unavailable`);
    return null;
  };
  const liq = lane(liqR, 'dollar-liquidity');
  const flows = lane(flowsR, 'stablecoin-flows');
  const dom = lane(domR, 'dominance');
  const mood = lane(moodR, 'sentiment');

  const available = [liq, flows, dom, mood].filter(Boolean).length;
  if (available < 3) {
    return Response.json(
      { error: `Only ${available}/4 lanes available — not enough for an honest macro read.` },
      { status: 502 },
    );
  }

  let score = 0;
  if (liq?.classification === 'supportive') {
    score++;
  }
  if (liq?.classification === 'restrictive') {
    score--;
  }
  if (flows?.flow === 'expanding') {
    score++;
  }
  if (flows?.flow === 'contracting' || flows?.pegStress) {
    score--;
  }
  if (mood?.mood === 'euphoria_risk') {
    score--; // sentiment extreme = fragility, not support
  }
  const backdrop = score >= 2 ? 'supportive' : score <= -1 ? 'hostile' : 'mixed';

  return Response.json({
    report: 'macro-overview',
    generatedAt: new Date().toISOString(),
    method:
      'Four lanes, each a full report from this store: dollar liquidity (Fed − TGA − RRP), stablecoin flows (supply direction + peg stress), BTC dominance rotation, and sentiment. Backdrop = lane tally (supportive ≥ +2; hostile ≤ −1 — liquidity and flows carry the weight; euphoric sentiment counts AGAINST). Research context, not trade advice.',
    source: 'NY Fed · Treasury FiscalData · DefiLlama · CoinMarketCap (per lane)',
    backdrop,
    lanes: {
      dollarLiquidity: liq ? { state: liq.classification, read: liq.read } : null,
      stablecoinFlows: flows
        ? { state: flows.flow, pegStress: flows.pegStress, read: flows.read }
        : null,
      dominance: dom ? { state: dom.rotation, read: dom.read } : null,
      sentiment: mood ? { state: mood.mood, read: mood.read } : null,
    },
    dataGaps: gaps,
    read: `Macro backdrop: ${[
      liq ? `liquidity ${liq.classification}` : null,
      flows ? `stable supply ${flows.flow}` : null,
      dom ? String(dom.rotation).replace(/_/g, ' ') : null,
      mood ? `mood ${String(mood.mood).replace(/_/g, ' ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ')} → ${backdrop} for crypto risk.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
