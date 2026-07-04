import { badSymbol, okxJson, parseAsset, readInput, round, upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: funding regime + flip detection (S.624 Shelf v4).
export const dynamic = 'force-dynamic';

type Funding = { fundingRate: string; nextFundingRate?: string; fundingTime: string };
type FundingHist = { fundingRate: string; fundingTime: string };

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  const rawSymbol = await readInput(req, 'symbol');
  const asset = parseAsset(rawSymbol, 'ETH');
  if (!asset) {
    return badSymbol(rawSymbol);
  }
  const instId = `${asset}-USDT-SWAP`;

  const [nowR, histR] = await Promise.allSettled([
    okxJson<Funding[]>(`/api/v5/public/funding-rate?instId=${instId}`, 120),
    okxJson<FundingHist[]>(
      `/api/v5/public/funding-rate-history?instId=${instId}&limit=21`,
      600,
    ),
  ]);
  if (nowR.status === 'rejected' || nowR.value.length === 0) {
    return upstreamDown(`Funding data for ${instId} (symbol may not have a USDT swap)`);
  }

  const gaps: string[] = [];
  const currentPct = round(Number.parseFloat(nowR.value[0].fundingRate) * 100, 4);
  const hist =
    histR.status === 'fulfilled' && histR.value.length > 1
      ? [...histR.value].reverse().map((h) => Number.parseFloat(h.fundingRate) * 100)
      : null;
  if (!hist) {
    gaps.push('funding history lane unavailable');
  }

  let flips = 0;
  let persistence = 1;
  let avg7dPct: number | null = null;
  if (hist) {
    for (let i = 1; i < hist.length; i++) {
      if (Math.sign(hist[i]) !== Math.sign(hist[i - 1]) && hist[i] !== 0) {
        flips++;
      }
    }
    const all = [...hist, currentPct];
    const sign = Math.sign(currentPct);
    persistence = 0;
    for (let i = all.length - 1; i >= 0 && Math.sign(all[i]) === sign; i--) {
      persistence++;
    }
    avg7dPct = round(hist.reduce((a, b) => a + b, 0) / hist.length, 4);
  }

  const annualizedPct = round(currentPct * 3 * 365, 1);
  let regime: 'positive_persistent' | 'negative_persistent' | 'freshly_flipped' | 'choppy';
  if (hist && flips >= 4) {
    regime = 'choppy';
  } else if (persistence <= 2 && hist) {
    regime = 'freshly_flipped';
  } else {
    regime = currentPct >= 0 ? 'positive_persistent' : 'negative_persistent';
  }

  return Response.json({
    report: 'funding-regime',
    symbol: asset,
    pair: instId,
    generatedAt: new Date().toISOString(),
    method:
      'Current OKX funding vs the last 21 settlements (~7d, 8h intervals): flips = sign changes; persistence = consecutive intervals with the current sign; annualized = rate × 3 × 365. Regimes: choppy ≥ 4 flips; freshly_flipped = persistence ≤ 2; else positive/negative_persistent. Funding is who PAYS, not who is right. Research context, not trade advice.',
    source: 'OKX public futures data',
    regime,
    evidence: {
      currentFundingPct8h: currentPct,
      annualizedCarryPct: annualizedPct,
      avg7dFundingPct8h: avg7dPct,
      flips7d: hist ? flips : null,
      persistenceIntervals: hist ? persistence : null,
      nextFundingTime: new Date(Number.parseInt(nowR.value[0].fundingTime, 10)).toISOString(),
    },
    dataGaps: gaps,
    read: `${asset} funding ${currentPct >= 0 ? '+' : ''}${currentPct}%/8h (${annualizedPct >= 0 ? '+' : ''}${annualizedPct}% annualized)${hist ? `, ${flips} flips in 7d, ${persistence} intervals at the current sign` : ''} → ${regime.replace(/_/g, ' ')}${currentPct >= 0 ? ' — longs paying shorts' : ' — shorts paying longs'}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
