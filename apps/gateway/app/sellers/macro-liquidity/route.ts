import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: macro liquidity monitor (§II.17 Shelf v2).
// Sold by the "Macro Liquidity" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → a derived read on US-dollar liquidity for crypto risk appetite:
// Fed securities holdings (NY Fed SOMA) − Treasury General Account (Treasury
// FiscalData) − ON reverse repo (NY Fed markets API) → net-liquidity
// direction + a supportive / neutral / restrictive classification.
//
// S.623: rewritten off FRED's fredgraph.csv onto the PRIMARY official APIs —
// FRED bot-blocks Vercel egress (deliveries hung to the 15s timeout and
// auto-refunded; local smokes passed because they egress residential).
// NY Fed + FiscalData are the sources FRED mirrors, published for
// programmatic access. Missing lanes are explicit gaps, never synthesized.
export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 70;

type Point = { date: string; value: number };

function sinceDate(): string {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).host} ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Fed securities holdings (SOMA total, $) — the QT/QE-moving part of the
 *  balance sheet. Weekly as-of dates; values in dollars → $B. */
async function somaHoldings(): Promise<Point[]> {
  const data = await getJson<{
    soma?: { summary?: { asOfDate: string; total: string }[] };
  }>('https://markets.newyorkfed.org/api/soma/summary.json');
  const rows = data.soma?.summary ?? [];
  const since = sinceDate();
  const points = rows
    .filter((r) => r.asOfDate >= since && Number.isFinite(Number.parseFloat(r.total)))
    .map((r) => ({ date: r.asOfDate, value: Number.parseFloat(r.total) / 1e9 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (points.length === 0) {
    throw new Error('SOMA returned no recent observations');
  }
  return points;
}

/** ON reverse repo — accepted amounts ($) per operation day → $B. */
async function reverseRepo(): Promise<Point[]> {
  const data = await getJson<{
    repo?: {
      operations?: {
        operationDate: string;
        operationType?: string;
        totalAmtAccepted?: number;
      }[];
    };
  }>(
    `https://markets.newyorkfed.org/api/rp/reverserepo/propositions/search.json?startDate=${sinceDate()}`,
  );
  const ops = data.repo?.operations ?? [];
  const byDate = new Map<string, number>();
  for (const op of ops) {
    if (op.operationType?.toLowerCase().includes('reverse') && op.operationDate) {
      byDate.set(
        op.operationDate,
        (byDate.get(op.operationDate) ?? 0) + (op.totalAmtAccepted ?? 0) / 1e9,
      );
    }
  }
  const points = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (points.length === 0) {
    throw new Error('NY Fed RRP returned no recent operations');
  }
  return points;
}

/** Treasury General Account opening balance ($M) per day → $B. The DTS
 *  table has several account_type rows per day — filter client-side (the
 *  API's `in:` filter chokes on parenthesised values). */
async function treasuryGeneralAccount(): Promise<Point[]> {
  const data = await getJson<{
    data?: { record_date: string; account_type: string; open_today_bal: string }[];
  }>(
    `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?filter=record_date:gte:${sinceDate()}&sort=record_date&page%5Bsize%5D=500`,
  );
  const rows = (data.data ?? []).filter(
    (r) => r.account_type.includes('TGA') && r.account_type.includes('Opening'),
  );
  const points = rows
    .map((r) => ({
      date: r.record_date,
      value: Number.parseFloat(r.open_today_bal) / 1000,
    }))
    .filter((p) => Number.isFinite(p.value));
  if (points.length === 0) {
    throw new Error('FiscalData TGA returned no recent observations');
  }
  return points;
}

function latest(points: Point[]): Point {
  return points.at(-1) as Point;
}

/** Change between the latest observation and the one closest to `days` ago. */
function deltaOver(points: Point[], days: number): number {
  const last = latest(points);
  const target = Date.parse(last.date) - days * 86_400_000;
  let ref = points[0];
  for (const p of points) {
    if (Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(ref.date) - target)) {
      ref = p;
    }
  }
  return last.value - ref.value;
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  // Fetch the three lanes independently — a failed lane becomes an explicit
  // gap (partial read), not a fabricated number. All three failing → 502
  // (the delivery leg auto-refunds the buyer).
  const [somaR, rrpR, tgaR] = await Promise.allSettled([
    somaHoldings(),
    reverseRepo(),
    treasuryGeneralAccount(),
  ]);

  const gaps: string[] = [];
  const fed = somaR.status === 'fulfilled' ? somaR.value : null;
  const repo = rrpR.status === 'fulfilled' ? rrpR.value : null;
  const treasury = tgaR.status === 'fulfilled' ? tgaR.value : null;
  if (!fed) {
    gaps.push('SOMA (Fed securities holdings) unavailable');
  }
  if (!repo) {
    gaps.push('ON reverse repo unavailable');
  }
  if (!treasury) {
    gaps.push('Treasury General Account unavailable');
  }
  if (!(fed || repo || treasury)) {
    return Response.json(
      { error: 'All liquidity series unavailable — try again shortly.' },
      { status: 502 },
    );
  }

  const fedB = fed ? { level: latest(fed).value, d28: deltaOver(fed, 28) } : null;
  const rrpB = repo ? { level: latest(repo).value, d28: deltaOver(repo, 28) } : null;
  const tgaB = treasury
    ? { level: latest(treasury).value, d28: deltaOver(treasury, 28) }
    : null;

  // Net liquidity ≈ Fed holdings − TGA − RRP. Rising = dollars pushed toward
  // risk assets; falling = drained. Direction needs all three lanes.
  const netDelta28 =
    fedB && rrpB && tgaB ? fedB.d28 - rrpB.d28 - tgaB.d28 : null;

  let classification: 'supportive' | 'restrictive' | 'neutral' | 'partial';
  if (netDelta28 === null) {
    classification = 'partial';
  } else if (netDelta28 > 40) {
    classification = 'supportive';
  } else if (netDelta28 < -40) {
    classification = 'restrictive';
  } else {
    classification = 'neutral';
  }

  return Response.json({
    report: 'macro-liquidity',
    generatedAt: new Date().toISOString(),
    method:
      'Net liquidity ≈ Fed securities holdings (NY Fed SOMA total) − Treasury General Account (FiscalData opening balance) − ON reverse repo (NY Fed accepted amounts); 28-day deltas in $B; supportive > +$40B, restrictive < −$40B, else neutral. SOMA is weekly (lags a few days); TGA/RRP are daily. Research context, not trade advice.',
    source:
      'Federal Reserve Bank of New York markets API · U.S. Treasury FiscalData (public-domain US government data)',
    classification,
    netLiquidityDelta28dBillionUsd:
      netDelta28 === null ? null : Number(netDelta28.toFixed(1)),
    lanes: {
      fedSecuritiesHoldings: fedB
        ? {
            levelBillionUsd: Number(fedB.level.toFixed(1)),
            delta28dBillionUsd: Number(fedB.d28.toFixed(1)),
            asOf: latest(fed as Point[]).date,
          }
        : null,
      reverseRepo: rrpB
        ? {
            levelBillionUsd: Number(rrpB.level.toFixed(1)),
            delta28dBillionUsd: Number(rrpB.d28.toFixed(1)),
            asOf: latest(repo as Point[]).date,
          }
        : null,
      treasuryGeneralAccount: tgaB
        ? {
            levelBillionUsd: Number(tgaB.level.toFixed(1)),
            delta28dBillionUsd: Number(tgaB.d28.toFixed(1)),
            asOf: latest(treasury as Point[]).date,
          }
        : null,
    },
    dataGaps: gaps,
    read:
      netDelta28 === null
        ? 'Partial read — a core series is unavailable; no classification synthesized.'
        : `Net liquidity ${netDelta28 > 0 ? 'rose' : netDelta28 < 0 ? 'fell' : 'was flat'} ~$${Math.abs(netDelta28).toFixed(0)}B over the last 4 weeks — ${classification} for crypto risk appetite. RRP ${rrpB && rrpB.d28 < 0 ? 'draining (cash leaving the Fed parking lot)' : 'building'}; TGA ${tgaB && tgaB.d28 > 0 ? 'rebuilding (drains liquidity)' : 'drawing down (adds liquidity)'}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
