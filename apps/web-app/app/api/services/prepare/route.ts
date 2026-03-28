import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { Challenge } from 'mppx';
import { getGatewayMapping, createRawGatewayMapping, getInternalApiKey } from '@/lib/service-gateway';
import type { GatewayMapping } from '@/lib/service-gateway';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/services/prepare
 *
 * Two flows depending on the service mapping:
 *
 * **Deliver-first** (gift cards, etc.):
 *   1. Call the gateway's internal endpoint — upstream service runs FIRST
 *   2. If upstream fails → return error, user is NEVER charged
 *   3. If upstream succeeds → build payment tx, store result in meta
 *
 * **Standard** (cheap, idempotent services):
 *   1. Pre-flight the gateway to get a 402 challenge
 *   2. Build payment tx from the challenge
 *   3. Return { bytes, digest, meta } for client-side signing
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

  const rl = rateLimit(`svc:${address}`, 5, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const mapping = body.serviceId
    ? getGatewayMapping(body.serviceId)
    : body.url
      ? createRawGatewayMapping(body.url, body.rawBody ?? {})
      : null;

  const serviceId = body.serviceId ?? body.url ?? 'unknown';

  if (!mapping) {
    return NextResponse.json({ error: `Unknown or disallowed service: ${serviceId}` }, { status: 400 });
  }

  try {
    let serviceBody: Record<string, unknown>;
    try {
      serviceBody = mapping.transformBody(body.fields ?? {});
    } catch (validationErr) {
      const msg = validationErr instanceof Error ? validationErr.message : 'Invalid service parameters';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (mapping.deliverFirst) {
      return await handleDeliverFirst(mapping, serviceBody, serviceId, address, jwt);
    }

    return await handleStandardMpp(mapping, serviceBody, serviceId, address, jwt);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service preparation failed';
    console.error('[services/prepare] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;

const DAILY_PURCHASE_LIMIT_USD = 50;
const MONTHLY_PURCHASE_LIMIT_USD = 500;

/**
 * Deliver-first: call upstream BEFORE building any payment.
 * If upstream fails, user is never charged.
 *
 * Safety order:
 * 1. Check USDC balance (prevent $0 users from getting free gift cards)
 * 2. Check daily/monthly spending limits
 * 3. Call upstream (Reloadly)
 * 4. Build payment tx
 */
async function handleDeliverFirst(
  mapping: GatewayMapping,
  serviceBody: Record<string, unknown>,
  serviceId: string,
  address: string,
  jwt: string | null,
): Promise<NextResponse> {
  const internalUrl = mapping.deliverFirst!.internalUrl;
  const internalKey = getInternalApiKey();

  if (!internalKey) {
    console.error('[services/prepare] INTERNAL_API_KEY not configured');
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  const parsedPrice = parseFloat(mapping.price);
  const estimatedCostUsd = (serviceBody as { unitPrice?: number }).unitPrice
    ? parseFloat(String((serviceBody as { unitPrice?: number }).unitPrice))
    : isNaN(parsedPrice) ? 1.0 : parsedPrice;

  // --- SAFETY CHECK 1: Verify user has enough USDC before touching upstream ---
  const coins = await client.getCoins({ owner: address, coinType: USDC_TYPE });
  const totalBalance = coins.data.reduce(
    (sum, c) => sum + BigInt(c.balance),
    BigInt(0),
  );
  const requiredRaw = BigInt(Math.ceil(estimatedCostUsd * 10 ** USDC_DECIMALS));
  if (totalBalance < requiredRaw) {
    const balanceUsd = Number(totalBalance) / 10 ** USDC_DECIMALS;
    return NextResponse.json(
      { error: `Insufficient USDC balance ($${balanceUsd.toFixed(2)}) for $${estimatedCostUsd.toFixed(2)} purchase` },
      { status: 400 },
    );
  }

  // --- SAFETY CHECK 2: Daily/monthly spending limits ---
  const limitCheck = await checkSpendingLimits(address, estimatedCostUsd);
  if (limitCheck) {
    return NextResponse.json({ error: limitCheck }, { status: 429 });
  }

  console.log(`[services/prepare] Deliver-first: balance OK ($${(Number(totalBalance) / 10 ** USDC_DECIMALS).toFixed(2)}), calling ${internalUrl}`);

  const deliverRes = await fetch(internalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': internalKey,
    },
    body: JSON.stringify(serviceBody),
  });

  if (!deliverRes.ok) {
    const errData = await deliverRes.json().catch(() => ({ error: 'Service delivery failed' }));
    const msg = (errData as { error?: string }).error ?? `Service failed (${deliverRes.status})`;
    console.error(`[services/prepare] Deliver-first failed (${deliverRes.status}):`, msg);
    return NextResponse.json({ error: msg }, { status: deliverRes.status >= 500 ? 502 : deliverRes.status });
  }

  const deliverData = (await deliverRes.json()) as {
    success: boolean;
    result: unknown;
    payment: { recipient: string; currency: string; amount: string };
  };

  if (!deliverData.success || !deliverData.payment) {
    return NextResponse.json({ error: 'Internal endpoint returned unexpected format' }, { status: 502 });
  }

  const { recipient, currency, amount: chargeAmount } = deliverData.payment;

  console.log(`[services/prepare] Deliver-first succeeded, building payment tx: $${chargeAmount} → ${recipient}`);

  // Record purchase for audit trail and spending limit tracking
  recordPurchase(address, serviceId, parseFloat(chargeAmount), String(serviceBody.productId ?? '')).catch(() => {});

  const decimals = currency.includes('::usdc::') ? 6 : 9;
  const rawAmount = BigInt(Math.round(parseFloat(chargeAmount) * 10 ** decimals));

  const tx = new Transaction();
  tx.setSender(address);

  // Reuse coins from balance check — no need to fetch again
  const coinIds = coins.data.map((c) => c.coinObjectId);
  if (coinIds.length > 1) {
    tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map((id) => tx.object(id)));
  }
  const [split] = tx.splitCoins(tx.object(coinIds[0]), [rawAmount]);
  tx.transferObjects([split], recipient);

  const txKindBytes = await tx.build({ client, onlyTransactionKind: true });
  const txKindBase64 = toBase64(txKindBytes);

  const sponsorHeaders: Record<string, string> = {
    Authorization: `Bearer ${ENOKI_SECRET_KEY!}`,
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
      allowedAddresses: [recipient],
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
      preDeliveredResult: deliverData.result,
    },
  });
}

/**
 * Standard MPP: pre-flight → 402 challenge → build payment tx.
 * Service is called AFTER payment in the complete route.
 */
async function handleStandardMpp(
  mapping: GatewayMapping,
  serviceBody: Record<string, unknown>,
  serviceId: string,
  address: string,
  jwt: string | null,
): Promise<NextResponse> {
  const challengeRes = await fetch(mapping.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceBody),
  });

  if (challengeRes.status !== 402) {
    if (challengeRes.ok) {
      console.log(`[services/prepare] ${serviceId} returned ${challengeRes.status} (free path) — no payment required`);
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
  const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
  if (totalBalance < rawAmount) {
    const balanceUsd = Number(totalBalance) / 10 ** decimals;
    return NextResponse.json(
      { error: `Insufficient USDC balance ($${balanceUsd.toFixed(2)}) for $${chargeAmount} service` },
      { status: 400 },
    );
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
    Authorization: `Bearer ${ENOKI_SECRET_KEY!}`,
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
}

/**
 * Check if a user has exceeded daily or monthly spending limits.
 * Returns an error message if exceeded, null if within limits.
 */
async function checkSpendingLimits(address: string, amountUsd: number): Promise<string | null> {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dailySpend, monthlySpend] = await Promise.all([
      prisma.servicePurchase.aggregate({
        where: { address, createdAt: { gte: dayAgo } },
        _sum: { amountUsd: true },
      }),
      prisma.servicePurchase.aggregate({
        where: { address, createdAt: { gte: monthAgo } },
        _sum: { amountUsd: true },
      }),
    ]);

    const dailyTotal = (dailySpend._sum.amountUsd ?? 0) + amountUsd;
    const monthlyTotal = (monthlySpend._sum.amountUsd ?? 0) + amountUsd;

    if (dailyTotal > DAILY_PURCHASE_LIMIT_USD) {
      return `Daily purchase limit reached ($${DAILY_PURCHASE_LIMIT_USD}/day). You've spent $${(dailyTotal - amountUsd).toFixed(2)} today. Try again tomorrow.`;
    }

    if (monthlyTotal > MONTHLY_PURCHASE_LIMIT_USD) {
      return `Monthly purchase limit reached ($${MONTHLY_PURCHASE_LIMIT_USD}/month). You've spent $${(monthlyTotal - amountUsd).toFixed(2)} this month.`;
    }

    return null;
  } catch (err) {
    console.error('[services/prepare] Spending limit check failed:', err);
    return null;
  }
}

async function recordPurchase(
  address: string,
  serviceId: string,
  amountUsd: number,
  productId?: string,
): Promise<void> {
  await prisma.servicePurchase.create({
    data: { address, serviceId, amountUsd, productId: productId || null },
  });
}
