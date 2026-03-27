import { NextResponse } from 'next/server';
import { getRegistry } from '@/lib/protocol-registry';
import { STABLE_ASSETS } from '@t2000/sdk';

export const runtime = 'nodejs';

const STABLECOINS = new Set<string>(STABLE_ASSETS);

interface RateEntry {
  protocol: string;
  protocolId: string;
  asset: string;
  saveApy: number;
  borrowApy: number;
}

interface BestSaveRate {
  protocol: string;
  protocolId: string;
  asset: string;
  rate: number;
}

const RATES_CACHE_TTL = 30_000;
let ratesCache: { data: { rates: RateEntry[]; bestSaveRate: BestSaveRate | null }; expiresAt: number } | null = null;

/**
 * GET /api/rates
 *
 * Returns current lending rates across all protocols and all stablecoins.
 * Cached for 30s since rates change slowly.
 */
export async function GET() {
  if (ratesCache && ratesCache.expiresAt > Date.now()) {
    return NextResponse.json(ratesCache.data);
  }

  try {
    const registry = getRegistry();
    const allRates = await registry.allRatesAcrossAssets();

    const rates: RateEntry[] = allRates.map((r) => ({
      protocol: r.protocol,
      protocolId: r.protocolId,
      asset: r.asset,
      saveApy: r.rates.saveApy,
      borrowApy: r.rates.borrowApy,
    }));

    let bestSaveRate: BestSaveRate | null = null;
    for (const r of rates) {
      if (!STABLECOINS.has(r.asset)) continue;
      if (!bestSaveRate || r.saveApy > bestSaveRate.rate) {
        bestSaveRate = { protocol: r.protocol, protocolId: r.protocolId, asset: r.asset, rate: r.saveApy };
      }
    }

    const data = { rates, bestSaveRate };
    ratesCache = { data, expiresAt: Date.now() + RATES_CACHE_TTL };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ rates: [], bestSaveRate: null });
  }
}
