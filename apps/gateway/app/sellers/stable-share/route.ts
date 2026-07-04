import { cmcJson, getJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: stablecoin share of crypto (risk gauge, S.624).
export const dynamic = 'force-dynamic';

type Latest = {
  data?: {
    stablecoin_market_cap?: number;
    quote?: { USD?: { total_market_cap?: number } };
  };
};
type LlamaStables = { peggedAssets?: { pegType: string; circulating?: { peggedUSD?: number }; circulatingPrevMonth?: { peggedUSD?: number } }[] };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  const [cmcR, llamaR] = await Promise.allSettled([
    cmcJson<Latest>('/v1/global-metrics/quotes/latest'),
    getJson<LlamaStables>('https://stablecoins.llama.fi/stablecoins?includePrices=false', {
      revalidate: 900,
    }),
  ]);

  const totalMcap =
    cmcR.status === 'fulfilled' ? cmcR.value.data?.quote?.USD?.total_market_cap : undefined;
  if (typeof totalMcap !== 'number') {
    return upstreamDown('Global market data');
  }

  const gaps: string[] = [];
  const usdPegged =
    llamaR.status === 'fulfilled'
      ? (llamaR.value.peggedAssets ?? []).filter((a) => a.pegType === 'peggedUSD')
      : null;
  if (!usdPegged) {
    gaps.push('stablecoin supply lane unavailable');
  }
  const stableNow = usdPegged
    ? usdPegged.reduce((a, s) => a + (s.circulating?.peggedUSD ?? 0), 0)
    : (cmcR.status === 'fulfilled' ? cmcR.value.data?.stablecoin_market_cap : undefined) ?? null;
  if (stableNow === null || stableNow === undefined) {
    return upstreamDown('Stablecoin data');
  }
  const stableMonthAgo = usdPegged
    ? usdPegged.reduce((a, s) => a + (s.circulatingPrevMonth?.peggedUSD ?? 0), 0)
    : null;

  const shareNow = (stableNow / totalMcap) * 100;
  // 30d-ago share needs 30d-ago total mcap; approximate trend from the
  // STABLE side only (share direction is dominated by the volatile leg —
  // disclosed in method).
  const stableDelta30Pct =
    stableMonthAgo && stableMonthAgo > 0
      ? round(((stableNow - stableMonthAgo) / stableMonthAgo) * 100, 2)
      : null;

  let posture: 'risk_off_build' | 'neutral' | 'risk_on_deploy';
  if (shareNow > 16) {
    posture = 'risk_off_build';
  } else if (shareNow < 10) {
    posture = 'risk_on_deploy';
  } else {
    posture = 'neutral';
  }

  return Response.json({
    report: 'stable-share',
    generatedAt: new Date().toISOString(),
    method:
      'Stablecoin share = USD-pegged supply (DefiLlama, CMC fallback) ÷ total crypto market cap (CMC). Posture thresholds: risk_off_build > 16% share, risk_on_deploy < 10%, else neutral. Stable-supply 30d delta shown for context — share moves mostly with the volatile leg, so treat the level, not the delta, as the signal. Research context, not trade advice.',
    source:
      'DefiLlama stablecoins API (open) · market data provided by CoinMarketCap',
    posture,
    evidence: {
      stableSupplyUsd: Math.round(stableNow),
      totalMarketCapUsd: Math.round(totalMcap),
      stableSharePct: round(shareNow, 2),
      stableSupplyDelta30dPct: stableDelta30Pct,
    },
    dataGaps: gaps,
    read: `Stablecoins are ${round(shareNow, 1)}% of crypto ($${(stableNow / 1e9).toFixed(0)}B of $${(totalMcap / 1e12).toFixed(2)}T)${stableDelta30Pct !== null ? `, stable supply ${stableDelta30Pct >= 0 ? '+' : ''}${stableDelta30Pct}% in 30d` : ''} → ${posture.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
