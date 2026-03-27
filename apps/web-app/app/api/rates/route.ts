import { NextResponse } from 'next/server';
import { getRegistry } from '@/lib/protocol-registry';

export const runtime = 'nodejs';

interface RateEntry {
  protocol: string;
  protocolId: string;
  asset: string;
  saveApy: number;
  borrowApy: number;
}

const RATES_CACHE_TTL = 30_000;
let ratesCache: { data: { rates: RateEntry[]; bestSaveRate: { protocol: string; protocolId: string; rate: number } | null }; expiresAt: number } | null = null;

/**
 * GET /api/rates
 *
 * Returns current lending rates from all protocols for USDC.
 * Cached for 30s since rates change slowly.
 */
export async function GET() {
  if (ratesCache && ratesCache.expiresAt > Date.now()) {
    return NextResponse.json(ratesCache.data);
  }

  try {
    const registry = getRegistry();
    const allRates = await registry.allRates('USDC');

    const rates: RateEntry[] = allRates.map((r) => ({
      protocol: r.protocol,
      protocolId: r.protocolId,
      asset: r.rates.asset,
      saveApy: r.rates.saveApy,
      borrowApy: r.rates.borrowApy,
    }));

    let bestSaveRate: { protocol: string; protocolId: string; rate: number } | null = null;
    for (const r of rates) {
      if (!bestSaveRate || r.saveApy > bestSaveRate.rate) {
        bestSaveRate = { protocol: r.protocol, protocolId: r.protocolId, rate: r.saveApy };
      }
    }

    const data = { rates, bestSaveRate };
    ratesCache = { data, expiresAt: Date.now() + RATES_CACHE_TTL };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ rates: [], bestSaveRate: null });
  }
}
