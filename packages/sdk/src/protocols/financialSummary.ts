import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SUPPORTED_ASSETS, MIST_PER_SUI } from '../constants.js';
import type { FinancialSummary, HFAlertLevel } from '../types.js';
import { getHealthFactor, getRates } from './navi.js';
import { getAllowanceBalance } from './allowance.js';

const HF_WARN_THRESHOLD = 1.8;
const HF_CRITICAL_THRESHOLD = 1.3;

function classifyHF(hf: number, hasBorrow: boolean): HFAlertLevel {
  if (!hasBorrow || !Number.isFinite(hf)) return 'none';
  if (hf <= HF_CRITICAL_THRESHOLD) return 'critical';
  if (hf <= HF_WARN_THRESHOLD) return 'warn';
  return 'none';
}

export interface FinancialSummaryOptions {
  allowanceId?: string;
}

/**
 * Fetch a complete financial snapshot for one wallet in parallel.
 * Designed for the notification cron — one call returns everything
 * a briefing, HF alert, or rate alert needs.
 */
export async function getFinancialSummary(
  client: SuiJsonRpcClient,
  walletAddress: string,
  options: FinancialSummaryOptions = {},
): Promise<FinancialSummary> {
  const [usdcBal, suiBal, hf, rates, allowance] = await Promise.all([
    client.getBalance({ owner: walletAddress, coinType: SUPPORTED_ASSETS.USDC.type })
      .catch(() => ({ totalBalance: '0' })),
    client.getBalance({ owner: walletAddress, coinType: SUPPORTED_ASSETS.SUI.type })
      .catch(() => ({ totalBalance: '0' })),
    getHealthFactor(client, walletAddress),
    getRates(client),
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
    gasReserveUsd: gasReserveSui, // caller can multiply by SUI price if needed
    allowanceBalance: allowance,
    fetchedAt: Date.now(),
  };
}

export { HF_WARN_THRESHOLD, HF_CRITICAL_THRESHOLD };
