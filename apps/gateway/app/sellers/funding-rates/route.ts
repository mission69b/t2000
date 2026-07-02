import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: perp funding-rate report (§II.13.B).
// Sold by the "Funding Radar" seed agent — reachable ONLY through the paid
// commerce delivery leg (signed x-t2000-delivery header).
//
// One call → a ranked report of perpetual funding rates across major venues
// (CoinGecko derivatives feed, keyless): where longs pay shorts the most (the
// carry you can farm by shorting perp + holding spot) and where funding is
// most negative. Annualized assuming 8h settlement (3×/day × 365).
export const dynamic = 'force-dynamic';

const SOURCE = 'https://api.coingecko.com/api/v3/derivatives';
// Liquid-market floors so the report can't be gamed by dust listings.
const MIN_OPEN_INTEREST_USD = 20_000_000;
const MIN_VOLUME_24H_USD = 10_000_000;
const TOP_N = 12;

type Ticker = {
  market: string;
  symbol: string;
  index_id: string;
  price: string;
  contract_type: string;
  funding_rate: number;
  open_interest: number;
  volume_24h: number;
};

function annualizedPct(fundingRate: number): number {
  // funding_rate is the per-interval % (8h convention on this feed).
  return Number((fundingRate * 3 * 365).toFixed(2));
}

function row(t: Ticker) {
  return {
    market: t.market,
    symbol: t.symbol,
    asset: t.index_id,
    fundingRatePct: t.funding_rate,
    annualizedPct: annualizedPct(t.funding_rate),
    openInterestUsd: Math.round(t.open_interest),
    volume24hUsd: Math.round(t.volume_24h),
  };
}

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired(
      '0x7642b3862769d5cfd8587525350df72676ba7ab3a5b558aa8607bf990f20796a',
    );
  }

  let tickers: Ticker[];
  try {
    const res = await fetch(SOURCE, {
      headers: { accept: 'application/json' },
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }
    tickers = (await res.json()) as Ticker[];
  } catch (err) {
    // Non-2xx → the delivery leg auto-refunds the buyer. Honest failure.
    return Response.json(
      { error: `Funding data unavailable: ${err instanceof Error ? err.message : 'fetch failed'}` },
      { status: 502 },
    );
  }

  const liquid = tickers.filter(
    (t) =>
      t.contract_type === 'perpetual' &&
      Number.isFinite(t.funding_rate) &&
      t.funding_rate !== 0 &&
      (t.open_interest ?? 0) >= MIN_OPEN_INTEREST_USD &&
      (t.volume_24h ?? 0) >= MIN_VOLUME_24H_USD,
  );

  const byRate = [...liquid].sort((a, b) => b.funding_rate - a.funding_rate);
  const highestPositive = byRate.slice(0, TOP_N).map(row);
  const mostNegative = byRate.slice(-TOP_N).reverse().map(row);

  // The classic carry: short the perp where funding is most positive, hold
  // spot — you collect funding while price exposure nets out.
  const bestCarry = highestPositive[0] ?? null;

  return Response.json({
    report: 'perp-funding-rates',
    generatedAt: new Date().toISOString(),
    method:
      'CoinGecko derivatives feed; perpetuals only; liquidity floors OI ≥ $20M and 24h volume ≥ $10M; annualized = rate × 3 × 365 (8h settlement convention). Rates move every interval — treat as a snapshot, not a promise.',
    marketsScanned: tickers.length,
    liquidMarkets: liquid.length,
    highestPositive,
    mostNegative,
    bestCarry: bestCarry
      ? {
          ...bestCarry,
          play: `Short ${bestCarry.symbol} on ${bestCarry.market}, hold ${bestCarry.asset} spot — collect ~${bestCarry.annualizedPct}% annualized while funding stays positive. NOT financial advice; funding flips.`,
        }
      : null,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
