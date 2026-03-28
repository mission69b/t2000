import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/transactions/execute
 *
 * Submits a user-signed sponsored transaction to Enoki for execution.
 *
 * The client signs the sponsored tx bytes locally (non-custodial),
 * then sends { digest, signature } here. The server forwards to
 * Enoki which co-signs with the gas sponsor and submits to Sui.
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  let body: { digest?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { digest, signature } = body;

  if (!digest || typeof digest !== 'string') {
    return NextResponse.json({ error: 'Missing digest' }, { status: 400 });
  }
  if (!signature || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // 10 executions per minute per digest prefix (approximates per-user)
  const rl = rateLimit(`exec:${digest.slice(0, 16)}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  try {
    const res = await fetch(
      `${ENOKI_BASE}/transaction-blocks/sponsor/${encodeURIComponent(digest)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ENOKI_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signature }),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.error(`[execute] Enoki error (${res.status}):`, errorBody);

      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(errorBody); } catch {}

      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Sponsored transaction expired or not found' },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: parsed.message ?? `Execution failed (${res.status})` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const { data } = await res.json();
    const confirmedDigest = data.digest;

    await suiClient.waitForTransaction({
      digest: confirmedDigest,
      options: { showEffects: true },
    });

    return NextResponse.json({ digest: confirmedDigest });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction execution failed';
    console.error('[execute] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
