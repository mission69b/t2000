import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/transactions/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transactions/prepare', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
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
    const res = await POST(buildRequest({ type: 'send', address: '0x1234', amount: 0 }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Invalid amount');
  });

  it('returns 400 for send without recipient', async () => {
    const res = await POST(buildRequest({ type: 'send', address: '0x1234', amount: 1 }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Invalid recipient');
  });

  it('returns 400 for unknown type', async () => {
    const res = await POST(buildRequest({ type: 'unknown', address: '0x1234', amount: 1 }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Unknown transaction type');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/transactions/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
