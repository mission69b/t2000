import { NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { NaviAdapter } from '@t2000/sdk/adapters';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

interface RateEntry {
  protocol: string;
  asset: string;
  saveApy: number;
  borrowApy: number;
}

/**
 * GET /api/rates
 *
 * Returns current lending rates from all protocols for USDC.
 * Used by smart cards to show "better rate" recommendations.
 */
export async function GET() {
  try {
    const navi = new NaviAdapter();
    navi.initSync(client);

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

    return NextResponse.json({ rates, bestSaveRate });
  } catch {
    return NextResponse.json({ rates: [], bestSaveRate: null });
  }
}
