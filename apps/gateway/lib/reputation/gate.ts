import { getOrComputeReputation } from './service';
import { scoreToTier, nextTierInfo, TIER_THRESHOLDS } from './scorer';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate-limit check based on wallet reputation.
 * Returns null if allowed, or a Response if rate-limited.
 */
export async function reputationGate(request: Request): Promise<Response | null> {
  const walletAddress = request.headers.get('x-wallet-address');
  if (!walletAddress) {
    // No wallet header — apply lowest tier limits
    const limit = TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1].rateLimit;
    const key = `anon:${getClientIp(request)}`;
    const blocked = checkRateLimit(key, limit);
    if (blocked) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          tier: 'anonymous',
          limit,
          retryAfterSeconds: 60,
        }),
        { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '60' } },
      );
    }
    return null;
  }

  try {
    const reputation = await getOrComputeReputation(walletAddress);
    const { tier, rateLimit } = scoreToTier(reputation.score);
    const key = `wallet:${walletAddress}`;
    const blocked = checkRateLimit(key, rateLimit);

    if (blocked) {
      const next = nextTierInfo(reputation.score);
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          tier,
          score: reputation.score,
          limit: rateLimit,
          retryAfterSeconds: 60,
          upgrade: next ? `${next.pointsNeeded} more points to reach ${next.nextTier} (${next.nextRateLimit} req/min)` : null,
        }),
        { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '60' } },
      );
    }

    return null;
  } catch {
    // On error, allow the request (fail open)
    return null;
  }
}

function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  if (entry.count > maxPerMinute) return true;
  return false;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

// Periodically clean up expired entries
setInterval(() => {
  const now = Date.now();
  Array.from(rateLimitMap.entries()).forEach(([key, entry]) => {
    if (entry.resetAt <= now) rateLimitMap.delete(key);
  });
}, 60_000);
