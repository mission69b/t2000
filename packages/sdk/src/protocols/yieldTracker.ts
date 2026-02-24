import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as navi from './navi.js';
import type { EarningsResult, FundStatusResult } from '../types.js';

export async function getEarnings(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<EarningsResult> {
  const hf = await navi.getHealthFactor(client, keypair);
  const rates = await navi.getRates(client);

  const supplied = hf.supplied;
  const apy = rates.USDC.saveApy / 100;
  const dailyRate = apy / 365;
  const dailyEarning = supplied * dailyRate;

  // Estimate total yield earned based on position age
  // For MVP, use a simple approximation
  const totalYieldEarned = dailyEarning * 30; // rough monthly estimate

  return {
    totalYieldEarned,
    currentApy: rates.USDC.saveApy,
    dailyEarning,
    supplied,
  };
}

export async function getFundStatus(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<FundStatusResult> {
  const earnings = await getEarnings(client, keypair);

  return {
    supplied: earnings.supplied,
    apy: earnings.currentApy,
    earnedToday: earnings.dailyEarning,
    earnedAllTime: earnings.totalYieldEarned,
    projectedMonthly: earnings.dailyEarning * 30,
  };
}
