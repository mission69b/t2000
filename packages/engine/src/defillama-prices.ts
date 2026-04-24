const DEFILLAMA_PRICES_URL = 'https://coins.llama.fi/prices/current';
const CACHE_TTL = 60_000;

let cache: { prices: Record<string, number>; ts: number } | null = null;
// Per-missing-set in-flight dedupe. The previous global `pendingRequest` would
// return stale results to a caller asking for a different coin set; this
// variant keys by the sorted missing-coins signature so concurrent identical
// requests (e.g. parallel `account_report` tools) coalesce, while distinct
// requests still fire independently.
const pendingFetches = new Map<string, Promise<Record<string, number>>>();

/**
 * Batch-fetch USD prices for Sui coin types from DefiLlama.
 * Returns a map of `coinType -> usdPrice`. Tokens not found return no entry.
 *
 * Cache behavior (post-0.47): merge-on-miss. If the cache is valid but missing
 * a few requested coin types, we fetch ONLY the missing ones and merge them
 * into the cached map — instead of throwing the entire cache away. This is
 * the common path when a wallet adds one new memecoin to a portfolio that
 * already has USDC/SUI prices cached. Saves ~0.5–1.5s on warm calls.
 */
export async function fetchTokenPrices(
  coinTypes: string[],
): Promise<Record<string, number>> {
  if (coinTypes.length === 0) return {};

  const now = Date.now();
  const cacheValid = cache !== null && now - cache.ts < CACHE_TTL;
  const cachedPrices = cacheValid ? cache!.prices : {};

  const missing = coinTypes.filter((ct) => !(ct in cachedPrices));
  if (missing.length === 0) return cachedPrices;

  const sig = missing.slice().sort().join('|');
  let inflight = pendingFetches.get(sig);
  if (!inflight) {
    inflight = doFetch(missing).finally(() => {
      pendingFetches.delete(sig);
    });
    pendingFetches.set(sig, inflight);
  }
  const fresh = await inflight;

  const merged = { ...cachedPrices, ...fresh };
  // Preserve original timestamp when extending an existing cache so we don't
  // accidentally extend the TTL by trickling new tokens in. A fully-stale
  // cache gets a fresh `now` stamp.
  cache = { prices: merged, ts: cacheValid ? cache!.ts : now };
  return merged;
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
