import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as navi from './navi.js';
import type { EarningsResult, FundStatusResult } from '../types.js';

export async function getEarnings(
  client: SuiJsonRpcClient,
  addressOrKeypair: string | Ed25519Keypair,
): Promise<EarningsResult> {
  const hf = await navi.getHealthFactor(client, addressOrKeypair);
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
  addressOrKeypair: string | Ed25519Keypair,
): Promise<FundStatusResult> {
  const earnings = await getEarnings(client, addressOrKeypair);

  return {
    supplied: earnings.supplied,
    apy: earnings.currentApy,
    earnedToday: earnings.dailyEarning,
    earnedAllTime: earnings.totalYieldEarned,
    projectedMonthly: earnings.dailyEarning * 30,
  };
}
