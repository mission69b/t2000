import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 59 }),
  rateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
  ),
}));

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/tool', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
}

function mockFetchSuccess(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe('/api/agent/tool', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    const mod = await import('./route');
    POST = mod.POST;
  });

  it('returns 400 for missing tool name', async () => {
    const res = await POST(buildRequest({ address: '0x123' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing address', async () => {
    const res = await POST(buildRequest({ tool: 'get_balance' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 for unknown tool', async () => {
    const res = await POST(buildRequest({
      tool: 'nonexistent_tool',
      args: {},
      address: '0x123',
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Unknown read tool');
  });

  it('executes get_balance with parallel fetches', async () => {
    mockFetchSuccess({ SUI: 10, USDC: 100 });
    mockFetchSuccess({ savings: 50 });
    mockFetchSuccess({ SUI: 3.5, USDC: 1 });

    const res = await POST(buildRequest({
      tool: 'get_balance',
      args: {},
      address: '0x123',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('balances');
    expect(body).toHaveProperty('positions');
    expect(body).toHaveProperty('prices');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('executes get_rates', async () => {
    mockFetchSuccess({ rates: [{ protocol: 'NAVI', rate: 3.5 }] });

    const res = await POST(buildRequest({
      tool: 'get_rates',
      args: {},
      address: '0x123',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rates).toBeDefined();
  });

  it('executes get_history with limit', async () => {
    mockFetchSuccess({ transactions: [] });

    const res = await POST(buildRequest({
      tool: 'get_history',
      args: { limit: 5 },
      address: '0x123',
    }));

    expect(res.status).toBe(200);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=5');
  });

  it('get_history defaults limit to 10', async () => {
    mockFetchSuccess({ transactions: [] });

    await POST(buildRequest({
      tool: 'get_history',
      args: {},
      address: '0x123',
    }));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
  });

  it('executes get_portfolio', async () => {
    mockFetchSuccess({ SUI: 10 });
    mockFetchSuccess({ SUI: 3.5 });

    const res = await POST(buildRequest({
      tool: 'get_portfolio',
      args: {},
      address: '0x123',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('balances');
    expect(body).toHaveProperty('prices');
  });

  it('executes get_health', async () => {
    mockFetchSuccess({ healthFactor: 2.5 });

    const res = await POST(buildRequest({
      tool: 'get_health',
      args: {},
      address: '0x123',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.healthFactor).toBe(2.5);
  });

  it('enforces rate limiting', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    vi.mocked(rateLimit).mockReturnValueOnce({
      success: false,
      remaining: 0,
      retryAfterMs: 30000,
    });

    const res = await POST(buildRequest({
      tool: 'get_rates',
      args: {},
      address: '0x123',
    }));

    expect(res.status).toBe(429);
  });
});
