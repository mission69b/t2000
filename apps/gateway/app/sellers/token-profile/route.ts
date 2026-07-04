import { badSymbol, cmcJson, parseAsset, readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: single-token identity card (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Meta = {
  name: string;
  category: string;
  description: string;
  date_launched: string | null;
  date_added: string;
  urls: { website?: string[]; twitter?: string[]; source_code?: string[] };
};
type Quote = {
  name: string;
  cmc_rank: number | null;
  circulating_supply: number;
  total_supply: number;
  max_supply: number | null;
  quote: {
    USD: {
      price: number;
      market_cap: number;
      fully_diluted_market_cap: number;
      volume_24h: number;
      percent_change_24h: number;
      percent_change_7d: number;
      percent_change_30d: number;
    };
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'BTC');
  if (!asset) {
    return badSymbol(rawSymbol);
  }

  const gaps: string[] = [];
  let meta: Meta | null = null;
  let quote: Quote | null = null;
  const [metaR, quoteR] = await Promise.allSettled([
    cmcJson<{ data: Record<string, Meta[]> }>(
      `/v2/cryptocurrency/info?symbol=${asset}&skip_invalid=true`,
    ),
    cmcJson<{ data: Record<string, Quote[]> }>(
      `/v2/cryptocurrency/quotes/latest?symbol=${asset}&skip_invalid=true`,
    ),
  ]);
  if (quoteR.status === 'fulfilled') {
    quote = quoteR.value.data[asset]?.[0] ?? null;
  }
  if (!quote) {
    return upstreamDown(`Market data for ${asset} (symbol may not be listed)`);
  }
  if (metaR.status === 'fulfilled') {
    meta = metaR.value.data[asset]?.[0] ?? null;
  }
  if (!meta) {
    gaps.push('metadata lane unavailable');
  }

  const q = quote.quote.USD;
  const unissuedPct =
    quote.max_supply && quote.max_supply > 0
      ? round(((quote.max_supply - quote.circulating_supply) / quote.max_supply) * 100, 1)
      : null;

  return Response.json({
    report: 'token-profile',
    symbol: asset,
    generatedAt: new Date().toISOString(),
    method:
      'Identity from CMC metadata (description, category, launch, links); market snapshot from live quotes (price, rank, 24h/7d/30d); supply structure = circulating vs total vs max with unissued share. Unavailable lanes stay explicit gaps. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    identity: meta
      ? {
          name: meta.name,
          category: meta.category,
          launched: meta.date_launched ?? meta.date_added,
          website: meta.urls.website?.[0] ?? null,
          twitter: meta.urls.twitter?.[0] ?? null,
          sourceCode: meta.urls.source_code?.[0] ?? null,
          summary: meta.description?.slice(0, 400) ?? null,
        }
      : null,
    market: {
      price: q.price,
      rank: quote.cmc_rank,
      marketCapUsd: Math.round(q.market_cap),
      fdvUsd: Math.round(q.fully_diluted_market_cap),
      volume24hUsd: Math.round(q.volume_24h),
      change24hPct: round(q.percent_change_24h),
      change7dPct: round(q.percent_change_7d),
      change30dPct: round(q.percent_change_30d),
    },
    supply: {
      circulating: quote.circulating_supply,
      total: quote.total_supply,
      max: quote.max_supply,
      unissuedPct,
    },
    dataGaps: gaps,
    read: `${quote.name} (${asset}): rank #${quote.cmc_rank ?? 'n/a'}, $${(q.market_cap / 1e9).toFixed(2)}B cap, ${q.percent_change_30d >= 0 ? '+' : ''}${round(q.percent_change_30d)}% 30d${unissuedPct !== null ? `; ${unissuedPct}% of max supply still unissued` : ''}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
