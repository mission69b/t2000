import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { getGatewayMapping } from '@/lib/service-gateway';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS ?? '0x0e4e22abd90526d96eb5de02f8c0076f4de593f17ce6d91bda3a09a0baa8c6eb';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/services/prepare
 *
 * Builds a USDC payment transaction for a service, sponsors it via Enoki.
 * Returns { bytes, digest, meta } for client-side signing.
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  const jwt = request.headers.get('x-zklogin-jwt');

  let body: { serviceId: string; fields: Record<string, string>; address: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { serviceId, fields, address } = body;

  if (!address?.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const mapping = getGatewayMapping(serviceId);
  if (!mapping) {
    return NextResponse.json({ error: `Unknown service: ${serviceId}` }, { status: 400 });
  }

  const price = mapping.price === 'dynamic'
    ? calculateDynamicPrice(serviceId, fields)
    : mapping.price;

  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    return NextResponse.json({ error: 'Invalid service price' }, { status: 400 });
  }

  try {
    const rawAmount = BigInt(Math.round(priceNum * 1e6));
    const tx = new Transaction();
    tx.setSender(address);

    const coins = await client.getCoins({ owner: address, coinType: USDC_TYPE });
    if (!coins.data.length) {
      return NextResponse.json({ error: 'No USDC balance to pay for service' }, { status: 400 });
    }

    const coinIds = coins.data.map(c => c.coinObjectId);
    if (coinIds.length > 1) {
      tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map(id => tx.object(id)));
    }
    const [split] = tx.splitCoins(tx.object(coinIds[0]), [rawAmount]);
    tx.transferObjects([split], TREASURY_ADDRESS);

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
        allowedAddresses: [TREASURY_ADDRESS],
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

    const serviceBody = mapping.transformBody(fields);

    return NextResponse.json({
      bytes: data.bytes,
      digest: data.digest,
      meta: {
        serviceId,
        gatewayUrl: mapping.url,
        serviceBody: JSON.stringify(serviceBody),
        price,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service preparation failed';
    console.error('[services/prepare] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function calculateDynamicPrice(serviceId: string, fields: Record<string, string>): string {
  if (serviceId === 'reloadly-giftcard') {
    const faceValue = parseFloat(fields.amount) || 25;
    const fee = faceValue * 0.05;
    return (faceValue + fee).toFixed(2);
  }
  return '1.00';
}
