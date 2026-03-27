import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { CetusAdapter } from '@t2000/sdk/adapters';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

let cetusAdapter: InstanceType<typeof CetusAdapter> | null = null;

function getCetus(): InstanceType<typeof CetusAdapter> {
  if (!cetusAdapter) {
    cetusAdapter = new CetusAdapter();
    cetusAdapter.initSync(client);
  }
  return cetusAdapter;
}

const QUOTE_CACHE_TTL = 10_000;

interface CachedQuote {
  data: { expectedOutput: number; priceImpact: number; poolPrice: number };
  expiresAt: number;
}

const quoteCache = new Map<string, CachedQuote>();

function getCachedQuote(from: string, to: string, amount: number): CachedQuote['data'] | null {
  const key = `${from}:${to}:${amount}`;
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) quoteCache.delete(key);
  return null;
}

function setCachedQuote(from: string, to: string, amount: number, data: CachedQuote['data']) {
  const key = `${from}:${to}:${amount}`;
  quoteCache.set(key, { data, expiresAt: Date.now() + QUOTE_CACHE_TTL });

  if (quoteCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of quoteCache) {
      if (v.expiresAt < now) quoteCache.delete(k);
    }
  }
}

/**
 * GET /api/quote?from=USDC&to=SUI&amount=50
 *
 * Returns a swap quote with expected output and price impact.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.toUpperCase();
  const to = searchParams.get('to')?.toUpperCase();
  const amountStr = searchParams.get('amount');

  if (!from || !to || !amountStr) {
    return NextResponse.json(
      { error: 'Missing required params: from, to, amount' },
      { status: 400 },
    );
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  if (from === to) {
    return NextResponse.json({ error: 'Cannot swap same asset' }, { status: 400 });
  }

  // 30 quotes per minute per IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`quote:${ip}`, 30, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  try {
    const cached = getCachedQuote(from, to, amount);
    if (cached) {
      return NextResponse.json({ from, to, amount, ...cached, cached: true });
    }

    const cetus = getCetus();
    const quote = await cetus.getQuote(from, to, amount);

    const data = {
      expectedOutput: quote.expectedOutput,
      priceImpact: quote.priceImpact,
      poolPrice: quote.poolPrice,
    };
    setCachedQuote(from, to, amount, data);

    return NextResponse.json({ from, to, amount, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quote failed';
    console.error('[quote] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
