import { badSymbol, cmcJson, parseAsset, readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: token-vs-BTC relative strength (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Quote = {
  name: string;
  quote: {
    USD: {
      percent_change_7d: number;
      percent_change_30d: number;
      percent_change_90d: number;
    };
  };
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'SOL');
  if (!asset) {
    return badSymbol(rawSymbol);
  }
  if (asset === 'BTC') {
    return Response.json(
      { error: 'Relative strength is measured AGAINST BTC — pass a non-BTC symbol.' },
      { status: 400 },
    );
  }

  let token: Quote | null;
  let btc: Quote | null;
  try {
    const data = (
      await cmcJson<{ data: Record<string, Quote[]> }>(
        `/v2/cryptocurrency/quotes/latest?symbol=${asset},BTC&skip_invalid=true`,
      )
    ).data;
    token = data[asset]?.[0] ?? null;
    btc = data.BTC?.[0] ?? null;
  } catch {
    token = null;
    btc = null;
  }
  if (!(token && btc)) {
    return upstreamDown(`Market data for ${asset} (symbol may not be listed)`);
  }

  const t = token.quote.USD;
  const b = btc.quote.USD;
  const spread = {
    d7: round(t.percent_change_7d - b.percent_change_7d),
    d30: round(t.percent_change_30d - b.percent_change_30d),
    d90: round(t.percent_change_90d - b.percent_change_90d),
  };
  const wins = [spread.d7, spread.d30, spread.d90].filter((s) => s > 0).length;
  const strength =
    wins === 3 && spread.d30 > 5
      ? 'outperforming'
      : wins >= 2
        ? 'edging_ahead'
        : wins === 1
          ? 'tracking'
          : 'lagging';

  return Response.json({
    report: 'relative-strength',
    symbol: asset,
    generatedAt: new Date().toISOString(),
    method:
      'Token return minus BTC return over 7/30/90d (CMC live quotes). outperforming = ahead on all three windows AND +5pts on 30d; edging_ahead = ahead on 2; tracking = 1; lagging = 0. The test most alt theses quietly fail — USD gains that trail BTC are BTC beta, not alpha. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    strength,
    evidence: {
      token: {
        change7dPct: round(t.percent_change_7d),
        change30dPct: round(t.percent_change_30d),
        change90dPct: round(t.percent_change_90d),
      },
      btc: {
        change7dPct: round(b.percent_change_7d),
        change30dPct: round(b.percent_change_30d),
        change90dPct: round(b.percent_change_90d),
      },
      spreadVsBtcPts: spread,
    },
    dataGaps: [],
    read: `${token.name} (${asset}) vs BTC: ${spread.d7 >= 0 ? '+' : ''}${spread.d7}pts 7d, ${spread.d30 >= 0 ? '+' : ''}${spread.d30}pts 30d, ${spread.d90 >= 0 ? '+' : ''}${spread.d90}pts 90d → ${strength.replace(/_/g, ' ')}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
