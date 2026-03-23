import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * POST /api/zklogin/salt
 *
 * Accepts a Google ID token (JWT) and returns a deterministic salt
 * derived from the user's Google `sub` claim. This salt, combined
 * with the JWT, produces a stable Sui address via zkLogin.
 *
 * The salt is derived using HMAC-SHA256(master_seed, sub) — the same
 * sub always produces the same salt, ensuring address stability.
 */
export async function POST(request: NextRequest) {
  if (!MASTER_SEED) {
    return NextResponse.json(
      { error: 'Salt service not configured' },
      { status: 500 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in 1 minute.' },
      { status: 429 },
    );
  }

  let body: { jwt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jwt } = body;
  if (!jwt || typeof jwt !== 'string') {
    return NextResponse.json({ error: 'Missing jwt field' }, { status: 400 });
  }

  let sub: string;
  try {
    const verifyOptions: Parameters<typeof jwtVerify>[2] = {
      issuer: 'https://accounts.google.com',
    };
    if (GOOGLE_CLIENT_ID) {
      verifyOptions.audience = GOOGLE_CLIENT_ID;
    }
    const { payload } = await jwtVerify(jwt, GOOGLE_JWKS, verifyOptions);

    if (!payload.sub) {
      return NextResponse.json({ error: 'JWT missing sub claim' }, { status: 400 });
    }
    sub = payload.sub;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JWT';
    return NextResponse.json({ error: `JWT verification failed: ${message}` }, { status: 401 });
  }

  // Take first 16 bytes (128 bits) of HMAC-SHA256 — Mysten prover requires 16-byte salt
  const rawHash = createHmac('sha256', Buffer.from(MASTER_SEED, 'hex'))
    .update(sub)
    .digest('hex')
    .slice(0, 32); // 32 hex chars = 16 bytes

  const salt = BigInt('0x' + rawHash).toString();

  return NextResponse.json({ salt });
}
