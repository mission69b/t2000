import { Transaction } from '@mysten/sui/transactions';
import { getSponsorWallet, getSuiClient } from '../lib/wallets.js';
import { prisma } from '../db/prisma.js';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;
const SPONSOR_AMOUNT_USD = 0.25;
const SPONSOR_AMOUNT_RAW = BigInt(Math.round(SPONSOR_AMOUNT_USD * 10 ** USDC_DECIMALS));
const DAILY_LIMIT = 20;
const IP_RATE_LIMIT_PER_HOUR = 3;

const pendingAddresses = new Set<string>();

export interface UsdcSponsorResult {
  digest: string;
  agentAddress: string;
  usdcFunded: string;
}

export function isSponsorPaused(): boolean {
  return process.env.USDC_SPONSOR_PAUSED === '1' || process.env.USDC_SPONSOR_PAUSED === 'true';
}

export async function checkUsdcDailyLimit(): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.usdcSponsorLog.count({
    where: { createdAt: { gte: oneDayAgo } },
  });
  return count < DAILY_LIMIT;
}

export async function checkUsdcIpRateLimit(ipAddress: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.usdcSponsorLog.count({
    where: { ipAddress, createdAt: { gte: oneHourAgo } },
  });
  return count < IP_RATE_LIMIT_PER_HOUR;
}

export async function isAlreadySponsored(agentAddress: string): Promise<boolean> {
  if (pendingAddresses.has(agentAddress)) return true;
  const existing = await prisma.usdcSponsorLog.findUnique({
    where: { agentAddress },
  });
  return existing !== null;
}

export async function sponsorUsdc(
  agentAddress: string,
  source: 'web' | 'cli',
  ipAddress?: string,
): Promise<UsdcSponsorResult> {
  if (pendingAddresses.has(agentAddress)) {
    throw new Error('ALREADY_SPONSORED');
  }

  const already = await isAlreadySponsored(agentAddress);
  if (already) {
    throw new Error('ALREADY_SPONSORED');
  }

  pendingAddresses.add(agentAddress);

  try {
    const client = getSuiClient();
    const sponsorKeypair = getSponsorWallet();
    const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress();

    const coins = await client.getCoins({ owner: sponsorAddress, coinType: USDC_TYPE });
    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);

    if (totalBalance < SPONSOR_AMOUNT_RAW) {
      throw new Error('SPONSOR_DEPLETED');
    }

    const tx = new Transaction();
    tx.setSender(sponsorAddress);

    if (coins.data.length > 1) {
      const primary = tx.object(coins.data[0].coinObjectId);
      const rest = coins.data.slice(1).map((c) => tx.object(c.coinObjectId));
      tx.mergeCoins(primary, rest);
      const [split] = tx.splitCoins(primary, [SPONSOR_AMOUNT_RAW]);
      tx.transferObjects([split], agentAddress);
    } else {
      const primary = tx.object(coins.data[0].coinObjectId);
      const [split] = tx.splitCoins(primary, [SPONSOR_AMOUNT_RAW]);
      tx.transferObjects([split], agentAddress);
    }

    const result = await client.signAndExecuteTransaction({
      signer: sponsorKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    await client.waitForTransaction({ digest: result.digest });

    await prisma.$transaction([
      prisma.usdcSponsorLog.create({
        data: {
          agentAddress,
          amount: String(SPONSOR_AMOUNT_USD),
          txDigest: result.digest,
          source,
          ...(ipAddress ? { ipAddress } : {}),
        },
      }),
      prisma.agent.upsert({
        where: { address: agentAddress },
        update: { lastSeen: new Date() },
        create: { address: agentAddress, name: null },
      }),
    ]);

    return {
      digest: result.digest,
      agentAddress,
      usdcFunded: String(SPONSOR_AMOUNT_USD),
    };
  } finally {
    pendingAddresses.delete(agentAddress);
  }
}
