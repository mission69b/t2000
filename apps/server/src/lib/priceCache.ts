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
    const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8b555571a820a5c015ae1ce01bd5e9c4ac51';

    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });

    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const currentSqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));

      if (currentSqrtPrice > 0n) {
        // Cetus uses Q64 fixed-point for sqrt_price
        // price = (sqrt_price / 2^64)^2 * 10^(decimals_a - decimals_b)
        // For USDC(6)/SUI(9) pool: adjustment = 10^(6-9) = 10^-3
        const Q64 = 2n ** 64n;
        const sqrtPriceFloat = Number(currentSqrtPrice) / Number(Q64);
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        // rawPrice = USDC per SUI in raw units, adjust for decimal difference
        const suiPriceUsd = rawPrice * 1e3;
        if (suiPriceUsd > 0.01 && suiPriceUsd < 1000) return suiPriceUsd;
      }
    }
  } catch {
    // Fall through to fallback
  }

  return 3.5;
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
  pollPrice();
  pollTimer = setInterval(pollPrice, POLL_INTERVAL_MS);
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
  if (recent.length === 0) return 3.5;

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
