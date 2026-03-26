import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function getBaseUrl(request: NextRequest): string {
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  let body: { tool: string; args: Record<string, unknown>; address: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tool, args, address } = body;

  if (!tool || !address) {
    return NextResponse.json({ error: 'Tool and address required' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`agent-tool:${ip}`, 60, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const baseUrl = getBaseUrl(request);

  try {
    const result = await executeTool(tool, args, address, baseUrl);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    console.error('[agent/tool] error:', String(tool), message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function executeTool(
  tool: string,
  args: Record<string, unknown>,
  address: string,
  baseUrl: string,
): Promise<unknown> {
  const get = (path: string) => internalFetch(path, baseUrl);

  switch (tool) {
    case 'get_balance': {
      const [balRes, posRes, pricesRes] = await Promise.all([
        get(`/api/balances?address=${address}`),
        get(`/api/positions?address=${address}`),
        get('/api/prices'),
      ]);
      return {
        balances: balRes,
        positions: posRes,
        prices: pricesRes,
      };
    }

    case 'get_rates': {
      return get('/api/rates');
    }

    case 'get_history': {
      const limit = Number(args.limit) || 10;
      return get(`/api/history?address=${address}&limit=${limit}`);
    }

    case 'get_portfolio': {
      const [balRes, pricesRes] = await Promise.all([
        get(`/api/balances?address=${address}`),
        get('/api/prices'),
      ]);
      return { balances: balRes, prices: pricesRes };
    }

    case 'get_health': {
      return get(`/api/positions?address=${address}`);
    }

    case 'discover_services': {
      const res = await fetch('https://mpp.t2000.ai/api/services');
      if (!res.ok) throw new Error(`Service discovery failed: ${res.status}`);
      return res.json();
    }

    default:
      throw new Error(`Unknown read tool: ${tool}`);
  }
}

async function internalFetch(path: string, baseUrl: string): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Internal fetch ${path} failed: ${res.status}`);
  }
  return res.json();
}
