import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

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

  try {
    const result = await executeTool(tool, args, address);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    console.error(`[agent/tool] ${tool} error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function executeTool(
  tool: string,
  args: Record<string, unknown>,
  address: string,
): Promise<unknown> {
  switch (tool) {
    case 'get_balance': {
      const [balRes, posRes, pricesRes] = await Promise.all([
        internalFetch(`/api/balances?address=${address}`),
        internalFetch(`/api/positions?address=${address}`),
        internalFetch('/api/prices'),
      ]);
      return {
        balances: balRes,
        positions: posRes,
        prices: pricesRes,
      };
    }

    case 'get_rates': {
      return internalFetch('/api/rates');
    }

    case 'get_history': {
      const limit = Number(args.limit) || 10;
      return internalFetch(`/api/history?address=${address}&limit=${limit}`);
    }

    case 'get_portfolio': {
      const [balRes, pricesRes] = await Promise.all([
        internalFetch(`/api/balances?address=${address}`),
        internalFetch('/api/prices'),
      ]);
      return { balances: balRes, prices: pricesRes };
    }

    case 'get_health': {
      return internalFetch(`/api/positions?address=${address}`);
    }

    default:
      throw new Error(`Unknown read tool: ${tool}`);
  }
}

async function internalFetch(path: string): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Internal fetch ${path} failed: ${res.status}`);
  }
  return res.json();
}
