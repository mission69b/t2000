import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gateway middleware — flat IP-based rate limit on service routes.
 *
 * The reputation-tier system (premium / established / trusted / new / anonymous)
 * was removed in Rock 2 (audit Tier 1 cut). No t2000 client sent the
 * `x-wallet-address` header that drove tier resolution, so the wallet-scored
 * limits never activated for real traffic. The current cap matches the
 * legacy `anonymous` ceiling and is a per-edge-instance ceiling — for a
 * distributed limit, swap in Upstash.
 */

const RATE_LIMIT_PER_MINUTE = 60;

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

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const blocked = checkRateLimit(`ip:${ip}`, RATE_LIMIT_PER_MINUTE);

  if (blocked) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        limit: RATE_LIMIT_PER_MINUTE,
        retryAfterSeconds: 60,
      },
      {
        status: 429,
        headers: { 'retry-after': '60' },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/|_next/|favicon.ico|icon.svg|llms.txt|openapi.json).*)',
  ],
};
