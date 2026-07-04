import { env } from '@/lib/env';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: market mood (§II.17 Shelf v3, CMC-backed — founder
// decision 2026-07-04: bundled/derived reads on our CMC key are in-bounds;
// raw quote passthrough stays off the shelf).
// Sold by the "Market Mood" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → crypto sentiment in context: CMC Fear & Greed (now + 7d/30d
// trend), total market cap direction, BTC dominance, and altcoin share →
// a mood classification (fearful_capitulation / fearful_stabilizing /
// neutral_chop / greedy_expansion / euphoria_risk). Requires CMC_API_KEY;
// without it the route 502s (the delivery leg auto-refunds — never a
// synthesized read). No input needed.
export const dynamic = 'force-dynamic';

const CMC = 'https://pro-api.coinmarketcap.com';

async function cmcJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CMC}${path}`, {
    headers: {
      accept: 'application/json',
      'X-CMC_PRO_API_KEY': env.CMC_API_KEY as string,
    },
    next: { revalidate: 900 },
  });
  if (!res.ok) {
    throw new Error(`CMC ${path.split('?')[0]} ${res.status}`);
  }
  return (await res.json()) as T;
}

type FngLatest = { data?: { value?: number; value_classification?: string } };
type FngHistorical = { data?: { timestamp: string; value: number }[] };
type GlobalMetrics = {
  data?: {
    btc_dominance?: number;
    btc_dominance_24h_percentage_change?: number;
    quote?: {
      USD?: {
        total_market_cap?: number;
        total_market_cap_yesterday_percentage_change?: number;
        altcoin_market_cap?: number;
      };
    };
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  if (!env.CMC_API_KEY) {
    return Response.json(
      { error: 'Market Mood is not configured (missing data key) — try again later.' },
      { status: 502 },
    );
  }

  const [latestR, histR, globalR] = await Promise.allSettled([
    cmcJson<FngLatest>('/v3/fear-and-greed/latest'),
    cmcJson<FngHistorical>('/v3/fear-and-greed/historical?limit=30'),
    cmcJson<GlobalMetrics>('/v1/global-metrics/quotes/latest'),
  ]);

  const fngNow =
    latestR.status === 'fulfilled' ? (latestR.value.data ?? null) : null;
  if (!fngNow || typeof fngNow.value !== 'number') {
    // Sentiment is the core lane — without it there is no honest mood read.
    return Response.json(
      { error: 'Sentiment data unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const gaps: string[] = [];
  // Historical rows arrive newest-first.
  const hist =
    histR.status === 'fulfilled' && (histR.value.data?.length ?? 0) > 1
      ? (histR.value.data as { timestamp: string; value: number }[])
      : null;
  if (!hist) {
    gaps.push('sentiment history lane unavailable');
  }
  const fng7dAgo = hist?.[Math.min(7, hist.length - 1)]?.value ?? null;
  const fng30dAgo = hist?.at(-1)?.value ?? null;

  const g = globalR.status === 'fulfilled' ? (globalR.value.data ?? null) : null;
  if (!g) {
    gaps.push('global market lane unavailable');
  }
  const usd = g?.quote?.USD;
  const mcapChange24hPct = usd?.total_market_cap_yesterday_percentage_change ?? null;
  const btcDom = g?.btc_dominance ?? null;
  const altcoinSharePct =
    usd?.total_market_cap && usd?.altcoin_market_cap
      ? (usd.altcoin_market_cap / usd.total_market_cap) * 100
      : null;

  const value = fngNow.value;
  const trend7d = fng7dAgo === null ? null : value - fng7dAgo;

  // Classification — deterministic, disclosed thresholds, ordered rules.
  let mood:
    | 'fearful_capitulation'
    | 'fearful_stabilizing'
    | 'neutral_chop'
    | 'greedy_expansion'
    | 'euphoria_risk';
  if (value <= 30 && (trend7d ?? 0) < 0 && (mcapChange24hPct ?? 0) < 0) {
    mood = 'fearful_capitulation';
  } else if (value <= 35) {
    mood = 'fearful_stabilizing';
  } else if (value >= 80) {
    mood = 'euphoria_risk';
  } else if (value >= 60 && (mcapChange24hPct ?? 0) > 0) {
    mood = 'greedy_expansion';
  } else {
    mood = 'neutral_chop';
  }

  return Response.json({
    report: 'market-mood',
    generatedAt: new Date().toISOString(),
    method:
      'CMC Fear & Greed index (0–100) with 7d/30d reference points; total market cap 24h direction; BTC dominance + altcoin share. Rules (ordered): fearful_capitulation = F&G ≤ 30 ∧ falling 7d ∧ market down 24h; fearful_stabilizing = F&G ≤ 35; euphoria_risk = F&G ≥ 80; greedy_expansion = F&G ≥ 60 ∧ market up 24h; else neutral_chop. Sentiment is contrarian context, not a timing signal. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap (integrated, attributed)',
    mood,
    evidence: {
      fearGreed: {
        value,
        classification: fngNow.value_classification ?? null,
        sevenDaysAgo: fng7dAgo,
        thirtyDaysAgo: fng30dAgo,
        trend7d,
      },
      totalMarketCapUsd: usd?.total_market_cap ? Math.round(usd.total_market_cap) : null,
      marketCapChange24hPct:
        mcapChange24hPct === null ? null : Number(mcapChange24hPct.toFixed(2)),
      btcDominancePct: btcDom === null ? null : Number(btcDom.toFixed(1)),
      altcoinSharePct:
        altcoinSharePct === null ? null : Number(altcoinSharePct.toFixed(1)),
    },
    dataGaps: gaps,
    read: `Fear & Greed is ${value} (${fngNow.value_classification ?? 'n/a'})${trend7d !== null ? `, ${trend7d >= 0 ? 'up' : 'down'} ${Math.abs(trend7d)} in 7d` : ''}${mcapChange24hPct !== null ? `; market cap ${mcapChange24hPct >= 0 ? '+' : ''}${mcapChange24hPct.toFixed(1)}% in 24h` : ''}${btcDom !== null ? `; BTC dominance ${btcDom.toFixed(1)}%` : ''} → ${mood.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
