import { cmcJson, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: top-10 correlation matrix (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Listing = { symbol: string; quote: { USD: { market_cap: number } } };
type HistEntry = {
  quotes?: { quote: { USD: { close: number } } }[];
};

const STABLES = new Set(['USDT', 'USDC', 'USDS', 'USDE', 'DAI', 'FDUSD']);

function dailyReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  return rets;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const ma = ax.reduce((x, y) => x + y, 0) / n;
  const mb = bx.reduce((x, y) => x + y, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ax[i] - ma) * (bx[i] - mb);
    va += (ax[i] - ma) ** 2;
    vb += (bx[i] - mb) ** 2;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let symbols: string[];
  try {
    const coins = (
      await cmcJson<{ data: Listing[] }>(
        '/v1/cryptocurrency/listings/latest?limit=20&sort=market_cap',
      )
    ).data;
    symbols = coins.map((c) => c.symbol).filter((s) => !STABLES.has(s)).slice(0, 10);
  } catch {
    return upstreamDown('Market data');
  }

  let series: Record<string, number[]>;
  try {
    const hist = await cmcJson<{ data: Record<string, HistEntry[]> }>(
      `/v2/cryptocurrency/ohlcv/historical?symbol=${symbols.join(',')}&count=31&interval=daily&skip_invalid=true`,
      3600,
    );
    series = Object.fromEntries(
      Object.entries(hist.data)
        .map(([sym, entries]) => [
          sym,
          dailyReturns((entries[0]?.quotes ?? []).map((q) => q.quote.USD.close)),
        ])
        .filter(([, rets]) => (rets as number[]).length >= 20),
    );
  } catch {
    return upstreamDown('Price history');
  }

  const got = symbols.filter((s) => series[s]);
  if (got.length < 5) {
    return upstreamDown('Correlation inputs (too few aligned histories)');
  }

  const matrix: Record<string, Record<string, number>> = {};
  const pairs: { pair: string; corr: number; band: string }[] = [];
  for (const a of got) {
    matrix[a] = {};
    for (const b of got) {
      const c = a === b ? 1 : round(pearson(series[a], series[b]), 2);
      matrix[a][b] = c;
      if (a < b) {
        pairs.push({
          pair: `${a}/${b}`,
          corr: c,
          band: c >= 0.75 ? 'tight' : c >= 0.4 ? 'loose' : 'decoupled',
        });
      }
    }
  }
  const avgOffDiag = round(pairs.reduce((x, p) => x + p.corr, 0) / pairs.length, 2);
  const decoupled = pairs.filter((p) => p.band === 'decoupled').sort((x, y) => x.corr - y.corr);

  return Response.json({
    report: 'correlation-matrix',
    generatedAt: new Date().toISOString(),
    method:
      'Pearson correlation of 30d daily log returns across the top-10 non-stable majors (CMC daily OHLCV): tight ≥ 0.75, loose ≥ 0.4, else decoupled. High average correlation = alts are one BTC trade; decoupled pairs are where diversification actually exists. Research context, not trade advice.',
    source: 'Market data provided by CoinMarketCap',
    assets: got,
    averagePairCorrelation: avgOffDiag,
    matrix,
    mostDecoupled: decoupled.slice(0, 5),
    dataGaps: symbols.filter((s) => !series[s]).map((s) => `${s} history unavailable`),
    read: `Average pair correlation ${avgOffDiag} across ${got.length} majors — ${avgOffDiag >= 0.7 ? 'the market is trading as ONE risk block' : avgOffDiag >= 0.45 ? 'moderate co-movement with real dispersion' : 'genuinely dispersed'}${decoupled.length > 0 ? `; most decoupled: ${decoupled[0].pair} (${decoupled[0].corr})` : ''}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
