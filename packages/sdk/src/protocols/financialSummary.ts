import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SUPPORTED_ASSETS, MIST_PER_SUI, CETUS_USDC_SUI_POOL } from '../constants.js';
import type { FinancialSummary, HFAlertLevel, HealthFactorResult } from '../types.js';
import { getHealthFactor, getRates } from './navi.js';
import { getAllowanceBalance } from './allowance.js';

const HF_WARN_THRESHOLD = 1.8;
const HF_CRITICAL_THRESHOLD = 1.3;

const HF_FALLBACK: HealthFactorResult = {
  healthFactor: Infinity,
  supplied: 0,
  borrowed: 0,
  maxBorrow: 0,
  liquidationThreshold: 0.75,
};

function classifyHF(hf: number, hasBorrow: boolean): HFAlertLevel {
  if (!hasBorrow || !Number.isFinite(hf)) return 'none';
  if (hf <= HF_CRITICAL_THRESHOLD) return 'critical';
  if (hf <= HF_WARN_THRESHOLD) return 'warn';
  return 'none';
}

async function fetchSuiPriceUsd(client: SuiJsonRpcClient): Promise<number> {
  try {
    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });
    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const sqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));
      if (sqrtPrice > 0n) {
        const Q64 = 2n ** 64n;
        const sqrtFloat = Number(sqrtPrice) / Number(Q64);
        const price = 1000 / (sqrtFloat * sqrtFloat);
        if (price > 0.01 && price < 1000) return price;
      }
    }
  } catch { /* fallback */ }
  return 1.0;
}

export interface FinancialSummaryOptions {
  allowanceId?: string;
}

/**
 * Fetch a complete financial snapshot for one wallet in parallel.
 * Designed for the notification cron — one call returns everything
 * a briefing, HF alert, or rate alert needs.
 *
 * Every sub-call has a fallback so a single RPC failure doesn't
 * crash the entire batch. Callers can check individual zero values
 * to detect degraded data.
 */
export async function getFinancialSummary(
  client: SuiJsonRpcClient,
  walletAddress: string,
  options: FinancialSummaryOptions = {},
): Promise<FinancialSummary> {
  const [usdcBal, suiBal, hf, rates, suiPrice, allowance] = await Promise.all([
    client.getBalance({ owner: walletAddress, coinType: SUPPORTED_ASSETS.USDC.type })
      .catch(() => ({ totalBalance: '0' })),
    client.getBalance({ owner: walletAddress, coinType: SUPPORTED_ASSETS.SUI.type })
      .catch(() => ({ totalBalance: '0' })),
    getHealthFactor(client, walletAddress)
      .catch(() => HF_FALLBACK),
    getRates(client),
    fetchSuiPriceUsd(client),
    options.allowanceId
      ? getAllowanceBalance(client, options.allowanceId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const usdcAvailable = Number(usdcBal.totalBalance) / 10 ** SUPPORTED_ASSETS.USDC.decimals;
  const gasReserveSui = Number(suiBal.totalBalance) / Number(MIST_PER_SUI);
  const saveApy = rates.USDC?.saveApy ?? 0;
  const borrowApy = rates.USDC?.borrowApy ?? 0;
  const dailyYield = hf.supplied * (saveApy / 365);

  return {
    walletAddress,
    usdcAvailable,
    savingsBalance: hf.supplied,
    debtBalance: hf.borrowed,
    idleUsdc: Math.max(0, usdcAvailable),
    healthFactor: hf.healthFactor,
    hfAlertLevel: classifyHF(hf.healthFactor, hf.borrowed > 0),
    saveApy,
    borrowApy,
    dailyYield,
    gasReserveSui,
    gasReserveUsd: gasReserveSui * suiPrice,
    allowanceBalance: allowance,
    fetchedAt: Date.now(),
  };
}

export { HF_WARN_THRESHOLD, HF_CRITICAL_THRESHOLD };
