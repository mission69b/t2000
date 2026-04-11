import { NextResponse } from 'next/server';
import { getOrComputeReputation } from '../../../../lib/reputation/service';
import { scoreToTier, nextTierInfo } from '../../../../lib/reputation/scorer';

/**
 * GET /api/reputation/:walletAddress
 * Public endpoint — returns reputation score, tier, rate limit, and next tier info.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ walletAddress: string }> },
) {
  const { walletAddress } = await params;

  if (!walletAddress || walletAddress.length < 20) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    const reputation = await getOrComputeReputation(walletAddress);
    const { tier, rateLimit } = scoreToTier(reputation.score);
    const next = nextTierInfo(reputation.score);

    return NextResponse.json({
      walletAddress,
      score: reputation.score,
      tier,
      rateLimit,
      totalPayments: reputation.totalPayments,
      totalVolumeUsdc: reputation.totalVolumeUsdc,
      failureRate: reputation.failureRate,
      daysSinceFirst: Math.round(reputation.daysSinceFirst),
      lastActivity: reputation.lastActivity.toISOString(),
      nextTier: next ? {
        tier: next.nextTier,
        pointsNeeded: next.pointsNeeded,
        rateLimit: next.nextRateLimit,
      } : null,
    });
  } catch (err) {
    console.error(`[reputation] Error for ${walletAddress}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to compute reputation' }, { status: 500 });
  }
}
