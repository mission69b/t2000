import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
}));

const { jwtVerify } = await import('jose');
const mockJwtVerify = vi.mocked(jwtVerify);

function buildRequest(body: unknown, ip = '127.0.0.1'): NextRequest {
  return new NextRequest('http://localhost/api/zklogin/salt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/zklogin/salt', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ZKLOGIN_MASTER_SEED', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client-id');

    const mod = await import('./route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns salt for valid JWT', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: 'google-user-123', iss: 'https://accounts.google.com' },
      protectedHeader: { alg: 'RS256' },
    } as never);

    const res = await POST(buildRequest({ jwt: 'valid.jwt.token' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.salt).toBeDefined();
    expect(typeof body.salt).toBe('string');
    expect(BigInt(body.salt)).toBeGreaterThan(0n);
  });

  it('returns same salt for same sub (deterministic)', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'deterministic-sub-456', iss: 'https://accounts.google.com' },
      protectedHeader: { alg: 'RS256' },
    } as never);

    const res1 = await POST(buildRequest({ jwt: 'jwt-1' }, '10.0.0.1'));
    const res2 = await POST(buildRequest({ jwt: 'jwt-2' }, '10.0.0.2'));

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.salt).toBe(body2.salt);
  });

  it('returns different salt for different sub', async () => {
    mockJwtVerify
      .mockResolvedValueOnce({
        payload: { sub: 'user-aaa', iss: 'https://accounts.google.com' },
        protectedHeader: { alg: 'RS256' },
      } as never)
      .mockResolvedValueOnce({
        payload: { sub: 'user-bbb', iss: 'https://accounts.google.com' },
        protectedHeader: { alg: 'RS256' },
      } as never);

    const res1 = await POST(buildRequest({ jwt: 'jwt-a' }, '10.0.0.3'));
    const res2 = await POST(buildRequest({ jwt: 'jwt-b' }, '10.0.0.4'));

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.salt).not.toBe(body2.salt);
  });

  it('returns 400 for missing jwt field', async () => {
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Missing jwt');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/zklogin/salt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid JWT', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('JWS signature verification failed'));

    const res = await POST(buildRequest({ jwt: 'bad.jwt.token' }));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toContain('JWT verification failed');
  });

  it('returns 429 when rate limited', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'rate-limit-user', iss: 'https://accounts.google.com' },
      protectedHeader: { alg: 'RS256' },
    } as never);

    const ip = '192.168.1.100';
    for (let i = 0; i < 10; i++) {
      await POST(buildRequest({ jwt: `jwt-${i}` }, ip));
    }

    const res = await POST(buildRequest({ jwt: 'jwt-11' }, ip));
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toContain('Rate limit');
  });
});
