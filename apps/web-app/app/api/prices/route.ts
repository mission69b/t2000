import { NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { CETUS_USDC_SUI_POOL } from '@t2000/sdk';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

interface PriceCache {
  prices: Record<string, number>;
  expiresAt: number;
}

const CACHE_TTL = 30_000;
let cache: PriceCache | null = null;

async function fetchSuiPrice(): Promise<number> {
  const obj = await client.getObject({
    id: CETUS_USDC_SUI_POOL,
    options: { showContent: true },
  });
  const content = obj.data?.content;
  if (content?.dataType !== 'moveObject') return 0;
  const fields = content.fields as Record<string, unknown>;
  const rawPrice = Number(fields.current_sqrt_price ?? 0);
  if (rawPrice <= 0) return 0;
  const sqrtP = rawPrice / 2 ** 64;
  return 1000 / (sqrtP * sqrtP * 1e3);
}

async function fetchPrices(): Promise<Record<string, number>> {
  if (cache && cache.expiresAt > Date.now()) return cache.prices;

  const suiPrice = await fetchSuiPrice().catch(() => 0);
  const prices: Record<string, number> = {
    SUI: suiPrice,
    USDC: 1,
    USDT: 1,
  };

  cache = { prices, expiresAt: Date.now() + CACHE_TTL };
  return prices;
}

/**
 * GET /api/prices
 *
 * Returns USD prices for supported assets.
 * Cached server-side for 30s.
 */
export async function GET() {
  try {
    const prices = await fetchPrices();
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[prices] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { SUI: 0, USDC: 1, USDT: 1 },
      { status: 200 },
    );
  }
}
