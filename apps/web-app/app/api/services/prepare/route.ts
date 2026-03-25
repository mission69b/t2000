import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { Challenge } from 'mppx';
import { getGatewayMapping, createRawGatewayMapping } from '@/lib/service-gateway';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/services/prepare
 *
 * 1. Pre-flights the gateway to get the 402 challenge (WWW-Authenticate header)
 * 2. Parses the challenge to extract recipient, amount, currency
 * 3. Builds a payment tx to the gateway's recipient
 * 4. Sponsors via Enoki
 * 5. Returns { bytes, digest, meta } for client-side signing
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: {
    serviceId?: string;
    fields?: Record<string, string>;
    url?: string;
    rawBody?: Record<string, unknown>;
    address: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  // 5 service calls per minute per address
  const rl = rateLimit(`svc:${address}`, 5, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const mapping = body.serviceId
    ? getGatewayMapping(body.serviceId)
    : body.url
      ? createRawGatewayMapping(body.url, body.rawBody ?? {})
      : null;

  const serviceId = body.serviceId ?? body.url ?? 'unknown';

  if (!mapping) {
    return NextResponse.json({ error: `Unknown service: ${serviceId}` }, { status: 400 });
  }

  try {
    const serviceBody = mapping.transformBody(body.fields ?? {});

    const challengeRes = await fetch(mapping.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serviceBody),
    });

    if (challengeRes.status !== 402) {
      if (challengeRes.ok) {
        const result = await challengeRes.json().catch(() => challengeRes.text());
        return NextResponse.json({
          success: true,
          paymentDigest: 'free',
          price: '0',
          serviceId,
          result,
        });
      }
      const errText = await challengeRes.text().catch(() => '');
      console.error(`[services/prepare] Gateway returned ${challengeRes.status}:`, errText);
      return NextResponse.json(
        { error: `Gateway error (${challengeRes.status})` },
        { status: challengeRes.status },
      );
    }

    let challenge: Challenge.Challenge;
    try {
      challenge = Challenge.fromResponse(challengeRes);
    } catch (err) {
      console.error('[services/prepare] Failed to parse 402 challenge:', err);
      return NextResponse.json(
        { error: 'Gateway returned 402 but challenge could not be parsed' },
        { status: 502 },
      );
    }

    const { amount: chargeAmount, currency, recipient: gatewayRecipient } = challenge.request as {
      amount: string;
      currency: string;
      recipient: string;
    };

    if (!gatewayRecipient || !chargeAmount || !currency) {
      console.error('[services/prepare] Challenge missing payment details:', challenge.request);
      return NextResponse.json(
        { error: 'Gateway challenge missing payment details' },
        { status: 502 },
      );
    }

    const decimals = currency.includes('::usdc::') ? 6 : 9;
    const rawAmount = BigInt(Math.round(parseFloat(chargeAmount) * 10 ** decimals));

    const tx = new Transaction();
    tx.setSender(address);

    const coins = await client.getCoins({ owner: address, coinType: currency });
    if (!coins.data.length) {
      return NextResponse.json({ error: 'No USDC balance to pay for service' }, { status: 400 });
    }

    const coinIds = coins.data.map((c) => c.coinObjectId);
    if (coinIds.length > 1) {
      tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map((id) => tx.object(id)));
    }
    const [split] = tx.splitCoins(tx.object(coinIds[0]), [rawAmount]);
    tx.transferObjects([split], gatewayRecipient);

    const txKindBytes = await tx.build({ client, onlyTransactionKind: true });
    const txKindBase64 = toBase64(txKindBytes);

    const sponsorHeaders: Record<string, string> = {
      Authorization: `Bearer ${ENOKI_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
    if (jwt) {
      sponsorHeaders['zklogin-jwt'] = jwt;
    }

    const sponsorRes = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
      method: 'POST',
      headers: sponsorHeaders,
      body: JSON.stringify({
        network: SUI_NETWORK,
        transactionBlockKindBytes: txKindBase64,
        sender: address,
        allowedAddresses: [gatewayRecipient],
      }),
    });

    if (!sponsorRes.ok) {
      const errorBody = await sponsorRes.text().catch(() => '');
      console.error(`[services/prepare] Sponsor error (${sponsorRes.status}):`, errorBody);
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(errorBody); } catch {}
      return NextResponse.json(
        { error: parsed.message ?? `Sponsorship failed (${sponsorRes.status})` },
        { status: sponsorRes.status >= 500 ? 502 : sponsorRes.status },
      );
    }

    const { data } = await sponsorRes.json();

    return NextResponse.json({
      bytes: data.bytes,
      digest: data.digest,
      meta: {
        serviceId,
        gatewayUrl: mapping.url,
        serviceBody: JSON.stringify(serviceBody),
        price: chargeAmount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service preparation failed';
    console.error('[services/prepare] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
