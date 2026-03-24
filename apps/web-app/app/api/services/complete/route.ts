import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Credential, Method } from 'mppx';
import { suiCharge } from '@t2000/mpp-sui/client';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/services/complete
 *
 * 1. Submits the signed payment tx via Enoki
 * 2. Waits for on-chain confirmation
 * 3. Calls the MPP gateway with the payment credential
 * 4. Returns the service result
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  let body: {
    signature: string;
    digest: string;
    meta: {
      serviceId: string;
      gatewayUrl: string;
      serviceBody: string;
      price: string;
    };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { signature, digest, meta } = body;

  if (!signature || !digest || !meta?.gatewayUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const executeRes = await fetch(
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

    if (!executeRes.ok) {
      const errorBody = await executeRes.text().catch(() => '');
      console.error(`[services/complete] Payment execution error (${executeRes.status}):`, errorBody);
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(errorBody); } catch {}
      return NextResponse.json(
        { error: parsed.message ?? 'Payment execution failed' },
        { status: executeRes.status >= 500 ? 502 : executeRes.status },
      );
    }

    const paymentResult = await executeRes.json();
    const paymentDigest = paymentResult.data?.digest ?? digest;

    console.log(`[services/complete] Payment executed: ${paymentDigest}, waiting for confirmation...`);

    await client.waitForTransaction({
      digest: paymentDigest,
      options: { showEffects: true },
    });

    console.log(`[services/complete] Payment confirmed on-chain, calling gateway...`);

    const mppClient = Method.toClient(suiCharge, {
      async createCredential({ challenge }) {
        return Credential.serialize({
          challenge,
          payload: { digest: paymentDigest },
        });
      },
    });

    const { Mppx } = await import('mppx/client');
    const mppx = Mppx.create({ methods: [mppClient] });

    const serviceResponse = await mppx.fetch(meta.gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: meta.serviceBody,
    });

    const contentType = serviceResponse.headers.get('content-type') ?? '';
    let result: unknown;

    if (contentType.includes('application/json')) {
      result = await serviceResponse.json();
    } else {
      result = await serviceResponse.text();
    }

    if (!serviceResponse.ok && serviceResponse.status !== 402) {
      console.error(
        `[services/complete] Gateway error (${serviceResponse.status}):`,
        typeof result === 'string' ? result : JSON.stringify(result),
      );
      return NextResponse.json(
        {
          error: typeof result === 'object' && result && 'error' in result
            ? (result as { error: string }).error
            : typeof result === 'object' && result && 'message' in result
              ? (result as { message: string }).message
              : 'Service request failed',
          serviceStatus: serviceResponse.status,
        },
        { status: serviceResponse.status },
      );
    }

    return NextResponse.json({
      success: true,
      paymentDigest,
      price: meta.price,
      serviceId: meta.serviceId,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service execution failed';
    console.error('[services/complete] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
