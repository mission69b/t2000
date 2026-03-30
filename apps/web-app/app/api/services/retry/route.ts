import { NextRequest, NextResponse } from 'next/server';
import { Credential, Method } from 'mppx';
import { suiCharge } from '@mppsui/mpp/client';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/services/retry
 *
 * Retries gateway delivery for a payment that already confirmed on-chain.
 * No re-payment — uses the existing paymentDigest as proof.
 */
export async function POST(request: NextRequest) {
  let body: {
    paymentDigest: string;
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

  const { paymentDigest, meta } = body;

  if (!paymentDigest || !meta?.gatewayUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const rl = rateLimit(`svc-retry:${paymentDigest.slice(0, 16)}`, 3, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  try {
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
      const errMsg = typeof result === 'object' && result && 'error' in result
        ? (result as { error: string }).error
        : typeof result === 'object' && result && 'message' in result
          ? (result as { message: string }).message
          : 'Service delivery failed';
      console.error(`[services/retry] Gateway error (${serviceResponse.status}):`, errMsg);
      return NextResponse.json(
        {
          error: errMsg,
          serviceStatus: serviceResponse.status,
          paymentConfirmed: true,
          paymentDigest,
          meta,
        },
        { status: 502 },
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
    const message = err instanceof Error ? err.message : 'Service retry failed';
    console.error('[services/retry] Error:', message);
    return NextResponse.json(
      {
        error: message,
        paymentConfirmed: true,
        paymentDigest,
        meta,
      },
      { status: 502 },
    );
  }
}
