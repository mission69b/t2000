import { Transaction } from '@mysten/sui/transactions';
import { getSponsorWallet, getSuiClient } from '../lib/wallets.js';
import { prisma } from '../db/prisma.js';

const MIN_SUI_FUNDING = 50_000_000n; // 0.05 SUI — enough for several transactions
const RATE_LIMIT_PER_HOUR = 10;

export interface SponsorResult {
  digest: string;
  agentAddress: string;
  suiFunded: string;
}

export async function checkRateLimit(ipAddress: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.sponsorRequest.count({
    where: { ipAddress, createdAt: { gte: oneHourAgo } },
  });
  return count < RATE_LIMIT_PER_HOUR;
}

export async function sponsorWalletInit(
  agentAddress: string,
  ipAddress: string,
  name?: string,
): Promise<SponsorResult> {
  const client = getSuiClient();
  const sponsorKeypair = getSponsorWallet();
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress();

  const tx = new Transaction();
  tx.setSender(sponsorAddress);

  const [coin] = tx.splitCoins(tx.gas, [MIN_SUI_FUNDING]);
  tx.transferObjects([coin], agentAddress);

  const result = await client.signAndExecuteTransaction({
    signer: sponsorKeypair,
    transaction: tx,
    options: { showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  await prisma.$transaction([
    prisma.sponsorRequest.create({
      data: { ipAddress, agentAddress },
    }),
    prisma.gasLedger.create({
      data: {
        agentAddress,
        suiSpent: '0.05',
        usdcCharged: '0',
        txDigest: result.digest,
        txType: 'bootstrap',
        status: 'settled',
      },
    }),
    prisma.agent.upsert({
      where: { address: agentAddress },
      update: { lastSeen: new Date(), name: name ?? undefined },
      create: { address: agentAddress, name: name ?? null },
    }),
  ]);

  return {
    digest: result.digest,
    agentAddress,
    suiFunded: '0.05',
  };
}
