import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import * as navi from './navi.js';
import type { EarningsResult, FundStatusResult } from '../types.js';

export async function getEarnings(
  client: SuiJsonRpcClient,
  address: string,
): Promise<EarningsResult> {
  const hf = await navi.getHealthFactor(client, address);
  const rates = await navi.getRates(client);

  const supplied = hf.supplied;
  const apy = rates.USDC.saveApy / 100;
  const dailyRate = apy / 365;
  const dailyEarning = supplied * dailyRate;

  const totalYieldEarned = dailyEarning * 30;

  return {
    totalYieldEarned,
    currentApy: rates.USDC.saveApy,
    dailyEarning,
    supplied,
  };
}

export async function getFundStatus(
  client: SuiJsonRpcClient,
  address: string,
): Promise<FundStatusResult> {
  const earnings = await getEarnings(client, address);

  return {
    supplied: earnings.supplied,
    apy: earnings.currentApy,
    earnedToday: earnings.dailyEarning,
    earnedAllTime: earnings.totalYieldEarned,
    projectedMonthly: earnings.dailyEarning * 30,
  };
}
