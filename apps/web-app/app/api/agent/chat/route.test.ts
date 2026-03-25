import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello from Claude' }],
        }),
      },
    })),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 29 }),
  rateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
  ),
}));

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
}

describe('/api/agent/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function importRoute(apiKey?: string) {
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns graceful fallback when ANTHROPIC_API_KEY is not set', async () => {
    const POST = await importRoute();

    const res = await POST(buildRequest({
      messages: [{ role: 'user', content: 'hello' }],
      address: '0x123',
      email: 'test@test.com',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain('not configured');
  });

  it('returns 400 for missing messages', async () => {
    const POST = await importRoute('sk-ant-test');
    const res = await POST(buildRequest({ address: '0x123' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing address', async () => {
    const POST = await importRoute('sk-ant-test');
    const res = await POST(buildRequest({
      messages: [{ role: 'user', content: 'hello' }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const POST = await importRoute('sk-ant-test');
    const req = new NextRequest('http://localhost/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns normalized response on success', async () => {
    const POST = await importRoute('sk-ant-test');

    const res = await POST(buildRequest({
      messages: [{ role: 'user', content: 'hello' }],
      address: '0x123',
      email: 'test@test.com',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe('Hello from Claude');
    expect(body.tool_calls).toBeUndefined();
  });

  it('enforces rate limiting', async () => {
    const POST = await importRoute('sk-ant-test');
    const { rateLimit } = await import('@/lib/rate-limit');
    vi.mocked(rateLimit).mockReturnValueOnce({
      success: false,
      remaining: 0,
      retryAfterMs: 30000,
    });

    const res = await POST(buildRequest({
      messages: [{ role: 'user', content: 'hello' }],
      address: '0x123',
      email: 'test@test.com',
    }));

    expect(res.status).toBe(429);
  });
});
