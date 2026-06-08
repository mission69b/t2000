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

/**
 * CORS for browser callers (Audric web is the first — the MPP `pay()` loop
 * runs client-side on the zkLogin session key, so the browser hits these
 * service routes cross-origin). The gateway is a PUBLIC paid API: payment
 * (on-chain USDC) is the gate, not origin — so `*` is correct and also
 * future-proofs other browser clients.
 *
 * `Expose-Headers: *` is load-bearing: mppx must READ the 402 challenge
 * headers (and the `Payment-Receipt` on success) from JS to drive the
 * pay→retry loop. Without it the browser hides them and the loop can't
 * complete. No credentials are used (payment header, not cookies), so the
 * `*` wildcards are valid.
 */
function corsHeaders(request: NextRequest): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // Reflect the requested headers (covers content-type + mppx's payment
    // header) — most robust across browsers.
    'Access-Control-Allow-Headers':
      request.headers.get('access-control-request-headers') ?? '*',
    'Access-Control-Expose-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };
}

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
  const cors = corsHeaders(request);

  // CORS preflight — the service routes only export POST, so without this
  // the OPTIONS preflight 405s and the browser never sends the real request.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: cors });
  }

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
        headers: { 'retry-after': '60', ...cors },
      },
    );
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(cors)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: [
    '/((?!api/|_next/|favicon.ico|icon.svg|llms.txt|openapi.json).*)',
  ],
};
