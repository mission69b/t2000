const DEFILLAMA_PRICES_URL = 'https://coins.llama.fi/prices/current';
const CACHE_TTL = 60_000;

let cache: { prices: Record<string, number>; ts: number } | null = null;
let pendingRequest: Promise<Record<string, number>> | null = null;

/**
 * Batch-fetch USD prices for Sui coin types from DefiLlama.
 * Returns a map of `coinType -> usdPrice`. Tokens not found return no entry.
 * Results are cached for 60s. Free API, no auth required.
 */
export async function fetchTokenPrices(
  coinTypes: string[],
): Promise<Record<string, number>> {
  if (coinTypes.length === 0) return {};

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    const allHit = coinTypes.every((ct) => ct in cache!.prices);
    if (allHit) return cache.prices;
  }

  if (pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = doFetch(coinTypes);
  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}

async function doFetch(coinTypes: string[]): Promise<Record<string, number>> {
  const coins = coinTypes.map((ct) => `sui:${ct}`).join(',');
  const url = `${DEFILLAMA_PRICES_URL}/${encodeURIComponent(coins)}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.warn(`[defillama-prices] HTTP ${res.status} from ${DEFILLAMA_PRICES_URL}`);
    return cache?.prices ?? {};
  }

  const json = (await res.json()) as {
    coins?: Record<string, { price: number; symbol?: string; decimals?: number }>;
  };

  const prices: Record<string, number> = {};

  if (json.coins) {
    for (const [key, val] of Object.entries(json.coins)) {
      const coinType = key.replace(/^sui:/, '');
      prices[coinType] = val.price;
    }
  }

  cache = { prices, ts: Date.now() };
  return prices;
}

export function clearPriceCache(): void {
  cache = null;
}
