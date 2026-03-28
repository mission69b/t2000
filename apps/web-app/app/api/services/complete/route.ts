import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Credential, Method } from 'mppx';
import { suiCharge } from '@t2000/mpp-sui/client';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { GATEWAY_BASE } from '@/lib/service-gateway';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';

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
      preDeliveredResult?: unknown;
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

  // 5 completions per minute per digest prefix
  const rl = rateLimit(`svc-complete:${digest.slice(0, 16)}`, 5, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let confirmedPaymentDigest: string | null = null;

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
    confirmedPaymentDigest = paymentResult.data?.digest ?? digest;

    console.log(`[services/complete] Payment executed: ${confirmedPaymentDigest}, waiting for confirmation...`);

    await client.waitForTransaction({
      digest: confirmedPaymentDigest!,
      options: { showEffects: true },
    });

    if (meta.preDeliveredResult) {
      console.log(`[services/complete] Payment confirmed — returning pre-delivered result (deliver-first flow)`);

      logToGateway(meta.serviceId, meta.price, confirmedPaymentDigest!).catch(() => {});

      return NextResponse.json({
        success: true,
        paymentDigest: confirmedPaymentDigest,
        price: meta.price,
        serviceId: meta.serviceId,
        result: meta.preDeliveredResult,
      });
    }

    console.log(`[services/complete] Payment confirmed on-chain, calling gateway...`);

    return await callGateway(confirmedPaymentDigest!, meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service execution failed';
    console.error('[services/complete] Error:', message);

    if (confirmedPaymentDigest) {
      return NextResponse.json(
        {
          error: message,
          paymentConfirmed: true,
          paymentDigest: confirmedPaymentDigest,
          meta,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callGateway(
  paymentDigest: string,
  meta: { serviceId: string; gatewayUrl: string; serviceBody: string; price: string },
): Promise<NextResponse> {
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

  if (contentType.startsWith('image/') || contentType.startsWith('audio/')) {
    const buffer = await serviceResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = contentType.split(';')[0].trim();
    const mediaType = contentType.startsWith('image/') ? 'image' : 'audio';
    result = { type: mediaType, dataUri: `data:${mimeType};base64,${base64}` };
  } else if (contentType.includes('application/json')) {
    result = await serviceResponse.json();
  } else {
    result = await serviceResponse.text();
  }

  if (!serviceResponse.ok && serviceResponse.status !== 402) {
    const errMsg = typeof result === 'object' && result && 'error' in result
      ? (result as { error: string }).error
      : typeof result === 'object' && result && 'message' in result
        ? (result as { message: string }).message
        : 'Service request failed';
    console.error(
      `[services/complete] Gateway error (${serviceResponse.status}):`,
      errMsg,
    );
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
}

async function logToGateway(serviceId: string, amount: string, digest: string): Promise<void> {
  const serviceMap: Record<string, { service: string; endpoint: string }> = {
    'reloadly-giftcard': { service: 'reloadly', endpoint: '/v1/order' },
    'lob-postcard': { service: 'lob', endpoint: '/v1/postcards' },
    'lob-letter': { service: 'lob', endpoint: '/v1/letters' },
  };
  const info = serviceMap[serviceId];
  if (!info) return;

  await fetch(`${GATEWAY_BASE}/api/internal/log-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify({ ...info, amount, digest }),
  });
}
