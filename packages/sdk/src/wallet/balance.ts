import { normalizeStructTag } from '@mysten/sui/utils';
import { SUPPORTED_ASSETS, STABLE_ASSETS, MIST_PER_SUI, CETUS_USDC_SUI_POOL } from '../constants.js';
import type { StableAsset } from '../constants.js';
import { resolveSymbol, resolveCoinDecimals } from '../token-registry.js';
import type { SuiCoreClient } from '../utils/sui.js';
import type { BalanceResponse, TokenHolding } from '../types.js';

const SUI_PRICE_FALLBACK = 1.0;
let _cachedSuiPrice = 0;
let _priceLastFetched = 0;
const PRICE_CACHE_TTL_MS = 60_000;

/**
 * Fetch SUI price in USD from the Cetus USDC/SUI pool's sqrt_price.
 *
 * Pool is Pool<USDC, SUI> so coin_a = USDC (6 dec), coin_b = SUI (9 dec).
 * current_sqrt_price (Q64 fixed-point) encodes sqrt(raw_price) where
 * raw_price = SUI_raw / USDC_raw.
 *
 * USDC per SUI = 10^(decimals_a - decimals_b) / raw_price
 *              = 10^(6-9) / raw_price
 *              = 1 / (raw_price * 1000)
 *
 * Equivalently: 1000 / raw_price
 */
async function fetchSuiPrice(client: SuiCoreClient): Promise<number> {
  const now = Date.now();
  if (_cachedSuiPrice > 0 && now - _priceLastFetched < PRICE_CACHE_TTL_MS) {
    return _cachedSuiPrice;
  }

  try {
    // [gRPC migration] `core.getObject` returns BCS content; request `json`
    // to read parsed Move fields (the legacy `content.fields` path is gone).
    const pool = await client.core.getObject({
      objectId: CETUS_USDC_SUI_POOL,
      include: { json: true },
    });

    const fields = pool.object?.json as Record<string, unknown> | null | undefined;
    if (fields) {
      const currentSqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));

      if (currentSqrtPrice > 0n) {
        const Q64 = 2n ** 64n;
        const sqrtPriceFloat = Number(currentSqrtPrice) / Number(Q64);
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        const price = 1000 / rawPrice;
        if (price > 0.01 && price < 1000) {
          _cachedSuiPrice = price;
          _priceLastFetched = now;
        }
      }
    }
  } catch {
    // Use cached/fallback price
  }

  return _cachedSuiPrice || SUI_PRICE_FALLBACK;
}

function safeNorm(coinType: string): string {
  try {
    return normalizeStructTag(coinType);
  } catch {
    return coinType;
  }
}

const SUI_TYPE_NORM = safeNorm(SUPPORTED_ASSETS.SUI.type);
const STABLE_BY_NORM: Record<string, StableAsset> = (() => {
  const m: Record<string, StableAsset> = {};
  for (const asset of STABLE_ASSETS) m[safeNorm(SUPPORTED_ASSETS[asset].type)] = asset;
  return m;
})();

/**
 * Full wallet balance: **every** held coin, not just the curated stables + SUI.
 *
 * Uses one `listBalances` (paginated) instead of N `getBalance` calls, then
 * partitions: stables → priced $1, SUI → Cetus-oracle priced, **everything else
 * → `tokens[]` amount-only** (`usdValue: null` — no price oracle for arbitrary
 * tokens; we don't guess). Decimals for non-registry tokens are read on-chain
 * (the only added call, and only for tokens you actually hold — necessary for a
 * correct amount). `totalUsd` sums **priced holdings only** so it never
 * overstates; `tokens` surfaces the rest honestly.
 */
export async function queryBalance(
  client: SuiCoreClient,
  address: string,
): Promise<BalanceResponse> {
  const held: Array<{ coinType: string; raw: bigint }> = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.core.listBalances({ owner: address, cursor: cursor ?? undefined });
    for (const b of page.balances) {
      const raw = BigInt(b.balance);
      if (raw > 0n) held.push({ coinType: b.coinType, raw });
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);

  const suiPriceUsd = await fetchSuiPrice(client);

  const stables = {} as Record<StableAsset, number>;
  for (const asset of STABLE_ASSETS) stables[asset] = 0;
  let totalStables = 0;
  let suiAmount = 0;
  const otherCoins: Array<{ coinType: string; raw: bigint }> = [];

  for (const { coinType, raw } of held) {
    const norm = safeNorm(coinType);
    if (norm === SUI_TYPE_NORM) {
      suiAmount = Number(raw) / Number(MIST_PER_SUI);
    } else if (STABLE_BY_NORM[norm]) {
      const asset = STABLE_BY_NORM[norm];
      const amount = Number(raw) / 10 ** SUPPORTED_ASSETS[asset].decimals;
      stables[asset] = amount;
      totalStables += amount;
    } else {
      otherCoins.push({ coinType, raw });
    }
  }

  // Non-stable, non-SUI holdings — amount-only (no price oracle). Decimals come
  // from the registry (no call) or on-chain coin metadata (unknown tokens only).
  const tokens: TokenHolding[] = await Promise.all(
    otherCoins.map(async ({ coinType, raw }) => {
      const decimals = await resolveCoinDecimals(client, coinType);
      return {
        coinType,
        symbol: resolveSymbol(coinType),
        amount: Number(raw) / 10 ** decimals,
        usdValue: null,
      };
    }),
  );
  tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const suiUsdValue = suiAmount * suiPriceUsd;

  return {
    stables,
    available: totalStables,
    sui: { amount: suiAmount, usdValue: suiUsdValue },
    tokens,
    totalUsd: totalStables + suiUsdValue,
  };
}
