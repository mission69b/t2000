import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gateway middleware — applies reputation-based rate limiting to service routes.
 * Fetches the cached tier from the reputation API (Node runtime), then applies
 * in-memory rate limiting at the edge.
 */

const TIER_RATE_LIMITS: Record<string, number> = {
  premium: 1000,
  established: 300,
  trusted: 60,
  new: 10,
  anonymous: 10,
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  return entry.count > maxPerMinute;
}

async function resolveTier(walletAddress: string, origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/api/reputation/${walletAddress}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return 'new';
    const data = (await res.json()) as { tier?: string };
    return data.tier ?? 'new';
  } catch {
    return 'new';
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isServiceRoute = !pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && pathname !== '/' && pathname !== '/favicon.ico';
  if (!isServiceRoute) return NextResponse.next();

  const walletAddress = request.headers.get('x-wallet-address');

  let tier = 'anonymous';
  if (walletAddress) {
    tier = await resolveTier(walletAddress, request.nextUrl.origin);
  }

  const limit = TIER_RATE_LIMITS[tier] ?? 10;
  const key = walletAddress ?? `ip:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'}`;
  const blocked = checkRateLimit(key, limit);

  if (blocked) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        tier,
        limit,
        retryAfterSeconds: 60,
      },
      {
        status: 429,
        headers: { 'retry-after': '60' },
      },
    );
  }

  const response = NextResponse.next();
  if (walletAddress) {
    response.headers.set('x-reputation-tier', tier);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!api/|_next/|favicon.ico|icon.svg|llms.txt|openapi.json).*)',
  ],
};
