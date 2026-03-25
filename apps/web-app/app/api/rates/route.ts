import { NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { NaviAdapter } from '@t2000/sdk/adapters';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

let _naviAdapter: NaviAdapter | null = null;
function getNaviAdapter(): NaviAdapter {
  if (!_naviAdapter) {
    _naviAdapter = new NaviAdapter();
    _naviAdapter.initSync(client);
  }
  return _naviAdapter;
}

interface RateEntry {
  protocol: string;
  asset: string;
  saveApy: number;
  borrowApy: number;
}

const RATES_CACHE_TTL = 30_000;
let ratesCache: { data: { rates: RateEntry[]; bestSaveRate: { protocol: string; rate: number } | null }; expiresAt: number } | null = null;

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
    const navi = getNaviAdapter();

    const rates: RateEntry[] = [];

    const naviRates = await navi.getRates('USDC').catch(() => null);
    if (naviRates) {
      rates.push({
        protocol: 'NAVI',
        asset: 'USDC',
        saveApy: naviRates.saveApy,
        borrowApy: naviRates.borrowApy,
      });
    }

    let bestSaveRate: { protocol: string; rate: number } | null = null;
    for (const r of rates) {
      if (!bestSaveRate || r.saveApy > bestSaveRate.rate) {
        bestSaveRate = { protocol: r.protocol, rate: r.saveApy };
      }
    }

    const data = { rates, bestSaveRate };
    ratesCache = { data, expiresAt: Date.now() + RATES_CACHE_TTL };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ rates: [], bestSaveRate: null });
  }
}
