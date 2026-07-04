import { badSymbol, cmcJson, parseAsset, readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: supply dilution read (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Quote = {
  name: string;
  circulating_supply: number;
  total_supply: number;
  max_supply: number | null;
  quote: { USD: { price: number; market_cap: number; fully_diluted_market_cap: number } };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'SUI');
  if (!asset) {
    return badSymbol(rawSymbol);
  }

  let quote: Quote | null;
  try {
    quote =
      (
        await cmcJson<{ data: Record<string, Quote[]> }>(
          `/v2/cryptocurrency/quotes/latest?symbol=${asset}&skip_invalid=true`,
        )
      ).data[asset]?.[0] ?? null;
  } catch {
    quote = null;
  }
  if (!quote) {
    return upstreamDown(`Supply data for ${asset} (symbol may not be listed)`);
  }

  const q = quote.quote.USD;
  const cap = quote.max_supply ?? quote.total_supply;
  const unissuedPct =
    cap > 0 ? round(((cap - quote.circulating_supply) / cap) * 100, 1) : null;
  const fdvGapPct =
    q.market_cap > 0
      ? round(((q.fully_diluted_market_cap - q.market_cap) / q.market_cap) * 100, 1)
      : null;

  let overhang: 'low' | 'moderate' | 'heavy' | 'unbounded';
  if (quote.max_supply === null && quote.total_supply <= quote.circulating_supply * 1.02) {
    overhang = 'low'; // effectively fully issued, no hard cap (e.g. ETH-like)
  } else if (unissuedPct === null) {
    overhang = 'unbounded';
  } else if (unissuedPct < 15) {
    overhang = 'low';
  } else if (unissuedPct < 40) {
    overhang = 'moderate';
  } else {
    overhang = 'heavy';
  }

  return Response.json({
    report: 'supply-overhang',
    symbol: asset,
    generatedAt: new Date().toISOString(),
    method:
      'Supply structure from live CMC data: unissued share = (max − circulating) ÷ max (total used when max is null); FDV gap = (FDV − mcap) ÷ mcap. Overhang: low < 15% unissued, moderate < 40%, else heavy; effectively-fully-issued uncapped supplies read low. Emissions SCHEDULE is not public data — this is the size of the overhang, not its timing. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    overhang,
    evidence: {
      circulating: quote.circulating_supply,
      total: quote.total_supply,
      max: quote.max_supply,
      unissuedPct,
      marketCapUsd: Math.round(q.market_cap),
      fdvUsd: Math.round(q.fully_diluted_market_cap),
      fdvGapPct,
    },
    dataGaps: [],
    read: `${quote.name} (${asset}): ${unissuedPct === null ? 'uncapped supply' : `${unissuedPct}% of max supply unissued`}${fdvGapPct !== null ? `, FDV ${fdvGapPct >= 0 ? '+' : ''}${fdvGapPct}% above market cap` : ''} → ${overhang} dilution overhang.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
