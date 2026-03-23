import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/transactions/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transactions/execute', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');

    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('returns 400 for missing digest', async () => {
    const res = await POST(buildRequest({ signature: 'sig' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing digest');
  });

  it('returns 400 for missing signature', async () => {
    const res = await POST(buildRequest({ digest: 'abc123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing signature');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/transactions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    const res = await handler(buildRequest({ digest: 'abc', signature: 'sig' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });
});
