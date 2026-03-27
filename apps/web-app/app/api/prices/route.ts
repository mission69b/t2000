import { NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { CetusAdapter } from '@t2000/sdk/adapters';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

let cetusAdapter: InstanceType<typeof CetusAdapter> | null = null;
function getCetus(): InstanceType<typeof CetusAdapter> {
  if (!cetusAdapter) {
    cetusAdapter = new CetusAdapter();
    cetusAdapter.initSync(client);
  }
  return cetusAdapter;
}

interface PriceCache {
  prices: Record<string, number>;
  expiresAt: number;
}

const CACHE_TTL = 30_000;
let cache: PriceCache | null = null;

const ASSETS_TO_PRICE = ['BTC', 'ETH', 'GOLD'] as const;

async function fetchPrices(): Promise<Record<string, number>> {
  if (cache && cache.expiresAt > Date.now()) return cache.prices;

  const cetus = getCetus();
  const [suiPrice, ...assetQuotes] = await Promise.all([
    cetus.getPoolPrice(),
    ...ASSETS_TO_PRICE.map((asset) =>
      cetus
        .getQuote('USDC', asset, 1)
        .then((q: { expectedOutput: number }) => ({ asset, price: q.expectedOutput > 0 ? 1 / q.expectedOutput : 0 }))
        .catch(() => ({ asset, price: 0 })),
    ),
  ]);

  const prices: Record<string, number> = {
    SUI: suiPrice,
    USDC: 1,
    USDT: 1,
  };

  for (const { asset, price } of assetQuotes) {
    prices[asset] = price;
  }

  cache = { prices, expiresAt: Date.now() + CACHE_TTL };
  return prices;
}

/**
 * GET /api/prices
 *
 * Returns USD prices for all supported assets.
 * Cached server-side for 30s to avoid hammering Cetus.
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
      { SUI: 1, USDC: 1, USDT: 1, BTC: 0, ETH: 0, GOLD: 0 },
      { status: 200 },
    );
  }
}
