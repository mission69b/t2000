import type { SuiClient } from '@mysten/sui/client';
import { SUPPORTED_ASSETS, MIST_PER_SUI } from '../constants.js';
import type { BalanceResponse } from '../types.js';

// Cetus USDC/SUI pool — same as used by priceCache on server
const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8b555571a820a5c015ae1ce01bd5e9c4ac51';

let _cachedSuiPrice = 3.5;
let _priceLastFetched = 0;
const PRICE_CACHE_TTL_MS = 60_000;

async function fetchSuiPrice(client: SuiClient): Promise<number> {
  const now = Date.now();
  if (now - _priceLastFetched < PRICE_CACHE_TTL_MS) return _cachedSuiPrice;

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
        // Adjust for decimal difference: USDC(6) vs SUI(9) → multiply by 1e3
        const price = rawPrice * 1e3;
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
  client: SuiClient,
  address: string,
): Promise<BalanceResponse> {
  const [usdcBalance, suiBalance, suiPriceUsd] = await Promise.all([
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.USDC.type }),
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
    fetchSuiPrice(client),
  ]);

  const usdcAmount = Number(usdcBalance.totalBalance) / 10 ** SUPPORTED_ASSETS.USDC.decimals;
  const suiAmount = Number(suiBalance.totalBalance) / Number(MIST_PER_SUI);

  const savings = 0; // Merged from Suilend in T2000.balance()
  const usdEquiv = suiAmount * suiPriceUsd;
  const total = usdcAmount + savings + usdEquiv;

  return {
    available: usdcAmount,
    savings,
    gasReserve: {
      sui: suiAmount,
      usdEquiv,
    },
    total,
    assets: {
      USDC: usdcAmount,
      SUI: suiAmount,
    },
  };
}
