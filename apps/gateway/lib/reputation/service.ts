import { prisma } from '../prisma';
import { computeScore, scoreToTier, type ReputationScore } from './scorer';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get or compute reputation for a wallet address.
 * Caches result in ReputationCache with 1h expiry.
 */
export async function getOrComputeReputation(walletAddress: string): Promise<ReputationScore> {
  const cached = await prisma.reputationCache.findUnique({
    where: { walletAddress },
  });

  if (cached && cached.expiresAt > new Date()) {
    return {
      score: cached.score,
      tier: cached.tier,
      totalPayments: cached.totalPayments,
      totalVolumeUsdc: cached.totalVolumeUsdc,
      failureRate: cached.failureRate,
      daysSinceFirst: cached.daysSinceFirst,
      lastActivity: cached.lastActivity,
    };
  }

  // Compute from MppPayment history
  const [payments, firstPayment, lastPayment] = await Promise.all([
    prisma.mppPayment.findMany({
      where: { sender: walletAddress },
      select: { amount: true },
    }),
    prisma.mppPayment.findFirst({
      where: { sender: walletAddress },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.mppPayment.findFirst({
      where: { sender: walletAddress },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const totalPayments = payments.length;
  const totalVolumeRaw = payments.reduce((s, p) => {
    const val = parseFloat(p.amount || '0');
    return s + (Number.isFinite(val) ? val : 0);
  }, 0);
  const totalVolumeUsdc = Math.round(totalVolumeRaw * 1_000_000); // store as 6-decimal int
  const daysSinceFirst = firstPayment
    ? (Date.now() - firstPayment.createdAt.getTime()) / 86400000
    : 0;
  const lastActivity = lastPayment?.createdAt ?? new Date();

  // Failure rate: for now 0 (we don't track failed payments in MppPayment)
  const failureRate = 0;

  const score = computeScore({
    totalPayments,
    totalVolumeUsdc: totalVolumeRaw,
    failureRate,
    daysSinceFirst,
  });

  const { tier } = scoreToTier(score);
  const now = new Date();

  await prisma.reputationCache.upsert({
    where: { walletAddress },
    update: {
      score,
      tier,
      totalPayments,
      totalVolumeUsdc,
      failureRate,
      daysSinceFirst,
      lastActivity,
      computedAt: now,
      expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
    },
    create: {
      walletAddress,
      score,
      tier,
      totalPayments,
      totalVolumeUsdc,
      failureRate,
      daysSinceFirst,
      lastActivity,
      computedAt: now,
      expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
    },
  });

  return {
    score,
    tier,
    totalPayments,
    totalVolumeUsdc,
    failureRate,
    daysSinceFirst,
    lastActivity,
  };
}
