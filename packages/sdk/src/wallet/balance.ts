import type { ClientWithCoreApi } from '@mysten/sui/client';
import { SUPPORTED_ASSETS, STABLE_ASSETS, MIST_PER_SUI, CETUS_USDC_SUI_POOL } from '../constants.js';
import type { StableAsset } from '../constants.js';
import type { BalanceResponse } from '../types.js';

const SUI_PRICE_FALLBACK = 1.0;
let _cachedSuiPrice = 0;
let _priceLastFetched = 0;
const PRICE_CACHE_TTL_MS = 60_000;

/**
 * Reset the module-level SUI price cache.
 *
 * Test/probe seam (mirrors the engine's `resetXCacheStore` injectors). Without
 * it, a parity probe that calls `queryBalance` on JSON-RPC then gRPC reuses the
 * price the first call cached and the second transport NEVER hits
 * `core.getObject` — so a broken gRPC pool-read shape would go undetected.
 * Reset between transports to force each to exercise its own `getObject` path.
 */
export function resetSuiPriceCache(): void {
  _cachedSuiPrice = 0;
  _priceLastFetched = 0;
}

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
async function fetchSuiPrice(client: ClientWithCoreApi): Promise<number> {
  const now = Date.now();
  if (_cachedSuiPrice > 0 && now - _priceLastFetched < PRICE_CACHE_TTL_MS) {
    return _cachedSuiPrice;
  }

  try {
    // [gRPC migration Stage 1] Read the pool via the transport-agnostic Core
    // API (`client.core.*`). On JSON-RPC this returns the same data as the
    // legacy `getObject`, so the rewrite soaks behavior-identically before the
    // transport flip. We request `json` here; Stage 2 hardens this pool read to
    // decode BCS `content` instead (the SDK warns `json` shape can vary across
    // transports). The cached/fallback price below already absorbs any drift.
    const pool = await client.core.getObject({
      objectId: CETUS_USDC_SUI_POOL,
      include: { json: true },
    });

    const fields = pool.object.json;
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
  client: ClientWithCoreApi,
  address: string,
): Promise<BalanceResponse> {
  // [gRPC migration Stage 1] `client.core.getBalance` replaces the legacy
  // `client.getBalance`. Shape drift: `.totalBalance` → `.balance.balance`
  // (the Core total = coinBalance + addressBalance, runtime-confirmed). Both
  // transports' `.core` return this shape, so this soaks on JSON-RPC today.
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
  const savings = 0; // Merged from NAVI in T2000.balance()
  const usdEquiv = suiAmount * suiPriceUsd;
  const total = totalStables + savings + usdEquiv;

  return {
    available: totalStables,
    savings,
    debt: 0,
    pendingRewards: 0,
    gasReserve: {
      sui: suiAmount,
      usdEquiv,
    },
    total,
    stables,
  };
}
