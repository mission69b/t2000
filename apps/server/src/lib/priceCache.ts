import { getSuiClient } from './wallets.js';

const TWAP_WINDOW_MS = 5 * 60 * 1000;
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 0.20;
const POLL_INTERVAL_MS = 30_000;
const GAS_FEE_CEILING_USD = 0.05;

interface PricePoint {
  price: number;
  timestamp: number;
}

let priceHistory: PricePoint[] = [];
let circuitBreakerTripped = false;
let circuitBreakerTrippedAt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchSuiPriceFromChain(): Promise<number> {
  try {
    const client = getSuiClient();

    // Fetch Cetus USDC/SUI pool to derive price
    // Use the well-known Cetus USDC/SUI pool on mainnet
    const CETUS_USDC_SUI_POOL = '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab';

    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });

    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const currentSqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));

      if (currentSqrtPrice > 0n) {
        // Pool is Pool<USDC, SUI> → coin_a=USDC(6), coin_b=SUI(9)
        // rawPrice = (sqrtPrice / 2^64)^2 = SUI_raw per USDC_raw
        // USDC per SUI = 1000 / rawPrice
        const Q64 = 2n ** 64n;
        const sqrtPriceFloat = Number(currentSqrtPrice) / Number(Q64);
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        const suiPriceUsd = 1000 / rawPrice;
        if (suiPriceUsd > 0.01 && suiPriceUsd < 1000) return suiPriceUsd;
      }
    }
  } catch {
    // Fall through to fallback
  }

  return 1.0;
}

function pruneOldPoints(): void {
  const cutoff = Date.now() - CIRCUIT_BREAKER_WINDOW_MS;
  priceHistory = priceHistory.filter((p) => p.timestamp > cutoff);
}

function checkCircuitBreaker(): void {
  if (priceHistory.length < 2) return;

  const oneHourAgo = Date.now() - CIRCUIT_BREAKER_WINDOW_MS;
  const oldPoints = priceHistory.filter((p) => p.timestamp < Date.now() - TWAP_WINDOW_MS);
  const recentPoints = priceHistory.filter((p) => p.timestamp >= Date.now() - TWAP_WINDOW_MS);

  if (oldPoints.length === 0 || recentPoints.length === 0) return;

  const oldPrice = oldPoints[0].price;
  const currentPrice = recentPoints[recentPoints.length - 1].price;
  const changeRatio = Math.abs(currentPrice - oldPrice) / oldPrice;

  if (changeRatio > CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerTripped = true;
    circuitBreakerTrippedAt = Date.now();
    console.warn(`[priceCache] Circuit breaker tripped: ${(changeRatio * 100).toFixed(1)}% price change in 1hr`);
  } else if (circuitBreakerTripped) {
    // Auto-reset after price stabilizes
    const timeSinceTrip = Date.now() - circuitBreakerTrippedAt;
    if (timeSinceTrip > TWAP_WINDOW_MS && changeRatio < CIRCUIT_BREAKER_THRESHOLD / 2) {
      circuitBreakerTripped = false;
      console.log('[priceCache] Circuit breaker reset — price stabilized');
    }
  }
}

async function pollPrice(): Promise<void> {
  try {
    const price = await fetchSuiPriceFromChain();
    priceHistory.push({ price, timestamp: Date.now() });
    pruneOldPoints();
    checkCircuitBreaker();
  } catch (err) {
    console.error('[priceCache] Poll error:', err instanceof Error ? err.message : err);
  }
}

export function startPriceCache(): void {
  if (pollTimer) return;
  pollPrice().catch((err) => {
    console.error('[priceCache] Initial poll error:', err instanceof Error ? err.message : err);
  });
  pollTimer = setInterval(() => {
    pollPrice().catch((err) => {
      console.error('[priceCache] Poll error:', err instanceof Error ? err.message : err);
    });
  }, POLL_INTERVAL_MS);
}

export function stopPriceCache(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function getSuiPriceTwap(): number {
  const cutoff = Date.now() - TWAP_WINDOW_MS;
  const recent = priceHistory.filter((p) => p.timestamp > cutoff);
  if (recent.length === 0) return 1.0;

  const sum = recent.reduce((acc, p) => acc + p.price, 0);
  return sum / recent.length;
}

export function isCircuitBreakerTripped(): boolean {
  return circuitBreakerTripped;
}

export function gasCostToUsd(gasCostSui: number): number {
  return gasCostSui * getSuiPriceTwap();
}

export function exceedsGasFeeCeiling(gasCostSui: number): boolean {
  return gasCostToUsd(gasCostSui) > GAS_FEE_CEILING_USD;
}

export const GAS_FEE_CEILING = GAS_FEE_CEILING_USD;
