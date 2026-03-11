import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SUPPORTED_ASSETS, STABLE_ASSETS, MIST_PER_SUI, CETUS_USDC_SUI_POOL } from '../constants.js';
import type { StableAsset } from '../constants.js';
import type { BalanceResponse } from '../types.js';

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
async function fetchSuiPrice(client: SuiJsonRpcClient): Promise<number> {
  const now = Date.now();
  if (_cachedSuiPrice > 0 && now - _priceLastFetched < PRICE_CACHE_TTL_MS) {
    return _cachedSuiPrice;
  }

  try {
    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });

    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
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

  return _cachedSuiPrice;
}

export async function queryBalance(
  client: SuiJsonRpcClient,
  address: string,
): Promise<BalanceResponse> {
  const stableBalancePromises = STABLE_ASSETS.map((asset) =>
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS[asset].type })
      .then((b) => ({ asset, amount: Number(b.totalBalance) / 10 ** SUPPORTED_ASSETS[asset].decimals })),
  );

  const [suiBalance, suiPriceUsd, ...stableResults] = await Promise.all([
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
    fetchSuiPrice(client),
    ...stableBalancePromises,
  ]);

  const stables = {} as Record<StableAsset, number>;
  let totalStables = 0;
  for (const { asset, amount } of stableResults) {
    stables[asset] = amount;
    totalStables += amount;
  }

  const suiAmount = Number(suiBalance.totalBalance) / Number(MIST_PER_SUI);
  const savings = 0; // Merged from NAVI in T2000.balance()
  const usdEquiv = suiAmount * suiPriceUsd;
  const total = totalStables + savings + usdEquiv;

  return {
    available: totalStables,
    savings,
    debt: 0,
    gasReserve: {
      sui: suiAmount,
      usdEquiv,
    },
    total,
    stables,
    assets: {
      USDC: stables.USDC ?? 0,
      SUI: suiAmount,
    },
  };
}
