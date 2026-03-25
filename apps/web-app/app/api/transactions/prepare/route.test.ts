import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

function fakeJwt(payload: Record<string, unknown> = { sub: '123', email: 'a@b.com' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

const TEST_JWT = fakeJwt();

function buildRequest(body: unknown, jwt: string = TEST_JWT): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['x-zklogin-jwt'] = jwt;

  return new NextRequest('http://localhost/api/transactions/prepare', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/transactions/prepare', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');

    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('returns 400 for invalid address', async () => {
    const res = await POST(buildRequest({ type: 'send', address: 'bad', amount: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid address');
  });

  it('returns 400 for invalid amount', async () => {
    const validAddr = '0x' + 'a'.repeat(64);
    const res = await POST(buildRequest({ type: 'send', address: validAddr, amount: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid amount');
  });

  it('returns error for send without recipient', async () => {
    const validAddr = '0x' + 'a'.repeat(64);
    const res = await POST(buildRequest({ type: 'send', address: validAddr, amount: 1 }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toContain('recipient');
  });

  it('returns 401 when JWT is missing', async () => {
    const req = new NextRequest('http://localhost/api/transactions/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'send', address: '0x1234', amount: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authentication');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/transactions/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zklogin-jwt': TEST_JWT,
      },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when ENOKI_SECRET_KEY is missing', async () => {
    vi.stubEnv('ENOKI_SECRET_KEY', '');
    vi.resetModules();

    const mod = await import('./route');
    const handler = mod.POST as unknown as (req: NextRequest) => Promise<Response>;

    const res = await handler(buildRequest({ type: 'send', address: '0x1234', amount: 1 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });
});
