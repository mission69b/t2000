export interface ReputationScore {
  score: number;
  tier: string;
  totalPayments: number;
  totalVolumeUsdc: number;
  failureRate: number;
  daysSinceFirst: number;
  lastActivity: Date;
}

export const TIER_THRESHOLDS = [
  { tier: 'premium', minScore: 800, rateLimit: 1000 },
  { tier: 'established', minScore: 400, rateLimit: 300 },
  { tier: 'trusted', minScore: 100, rateLimit: 60 },
  { tier: 'new', minScore: 0, rateLimit: 10 },
] as const;

export type Tier = typeof TIER_THRESHOLDS[number]['tier'];

export function scoreToTier(score: number): { tier: Tier; rateLimit: number } {
  for (const t of TIER_THRESHOLDS) {
    if (score >= t.minScore) return { tier: t.tier, rateLimit: t.rateLimit };
  }
  return { tier: 'new', rateLimit: 10 };
}

export function nextTierInfo(score: number): { nextTier: string; pointsNeeded: number; nextRateLimit: number } | null {
  const sorted = [...TIER_THRESHOLDS].sort((a, b) => a.minScore - b.minScore);
  for (const t of sorted) {
    if (score < t.minScore) {
      return { nextTier: t.tier, pointsNeeded: t.minScore - score, nextRateLimit: t.rateLimit };
    }
  }
  return null;
}

/**
 * Compute reputation score from payment history.
 * Factors:
 *   - Payment count (log scale, max 400 pts)
 *   - Volume (log scale, max 300 pts)
 *   - Account age (linear, max 200 pts)
 *   - Failure penalty (up to -100 pts)
 */
export function computeScore(params: {
  totalPayments: number;
  totalVolumeUsdc: number;
  failureRate: number;
  daysSinceFirst: number;
}): number {
  const paymentScore = Math.min(400, Math.log2(params.totalPayments + 1) * 60);

  const volumeScore = Math.min(300, Math.log10(params.totalVolumeUsdc + 1) * 100);

  const ageScore = Math.min(200, params.daysSinceFirst * 2);

  const failurePenalty = Math.min(100, params.failureRate * 200);

  return Math.max(0, Math.round(paymentScore + volumeScore + ageScore - failurePenalty));
}
