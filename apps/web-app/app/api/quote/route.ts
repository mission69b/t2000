import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { CetusAdapter } from '@t2000/sdk/adapters';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

let cetusAdapter: CetusAdapter | null = null;

function getCetus(): CetusAdapter {
  if (!cetusAdapter) {
    cetusAdapter = new CetusAdapter();
    cetusAdapter.initSync(client);
  }
  return cetusAdapter;
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
    const cetus = getCetus();
    const quote = await cetus.getQuote(from, to, amount);

    return NextResponse.json({
      from,
      to,
      amount,
      expectedOutput: quote.expectedOutput,
      priceImpact: quote.priceImpact,
      poolPrice: quote.poolPrice,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quote failed';
    console.error('[quote] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
