import { SUPPORTED_ASSETS, STABLE_ASSETS, MIST_PER_SUI, CETUS_USDC_SUI_POOL } from '../constants.js';
import type { StableAsset } from '../constants.js';
import type { SuiCoreClient } from '../utils/sui.js';
import type { BalanceResponse } from '../types.js';

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

export async function queryBalance(
  client: SuiCoreClient,
  address: string,
): Promise<BalanceResponse> {
  const stableBalancePromises = STABLE_ASSETS.map((asset) =>
    client.core.getBalance({ owner: address, coinType: SUPPORTED_ASSETS[asset].type })
      .then((b) => ({ asset, amount: Number(b.balance.balance) / 10 ** SUPPORTED_ASSETS[asset].decimals }))
      .catch(() => ({ asset, amount: 0 })),
  );

  const [suiBalance, suiPriceUsd, ...stableResults] = await Promise.all([
    client.core.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
    fetchSuiPrice(client),
    ...stableBalancePromises,
  ]);

  const stables = {} as Record<StableAsset, number>;
  let totalStables = 0;
  for (const { asset, amount } of stableResults) {
    stables[asset] = amount;
    totalStables += amount;
  }

  const suiAmount = Number(suiBalance.balance.balance) / Number(MIST_PER_SUI);
  const suiUsdValue = suiAmount * suiPriceUsd;

  return {
    stables,
    available: totalStables,
    sui: {
      amount: suiAmount,
      usdValue: suiUsdValue,
    },
    totalUsd: totalStables + suiUsdValue,
  };
}
