import { NextRequest, NextResponse } from 'next/server';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders, SERVICE_FEE_RATE } from '@/lib/reloadly';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from '@/lib/constants';
import { fetchWithRetry } from '@/lib/gateway';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

/**
 * Direct redemption URLs by brand keyword → country → URL.
 * Bypasses Reloadly's cardredemption.com which blocks iCloud Private Relay.
 */
const DIRECT_REDEEM_URLS: Record<string, Record<string, string> & { default: string }> = {
  amazon: {
    AU: 'https://www.amazon.com.au/gc/redeem',
    US: 'https://www.amazon.com/gc/redeem',
    GB: 'https://www.amazon.co.uk/gc/redeem',
    CA: 'https://www.amazon.ca/gc/redeem',
    DE: 'https://www.amazon.de/gc/redeem',
    FR: 'https://www.amazon.fr/gc/redeem',
    JP: 'https://www.amazon.co.jp/gc/redeem',
    IN: 'https://www.amazon.in/gc/redeem',
    default: 'https://www.amazon.com/gc/redeem',
  },
  'uber eats': {
    default: 'https://www.ubereats.com/gift-cards',
  },
  uber: {
    default: 'https://www.uber.com/gift-cards',
  },
  doordash: {
    default: 'https://www.doordash.com/consumer/redeem/gift-card/',
  },
  starbucks: {
    US: 'https://app.starbucks.com/gift',
    default: 'https://www.starbucks.com/gift',
  },
  'google play': {
    default: 'https://play.google.com/redeem',
  },
  spotify: {
    default: 'https://www.spotify.com/redeem/',
  },
  netflix: {
    default: 'https://www.netflix.com/redeem',
  },
  playstation: {
    default: 'https://store.playstation.com/en-us/latest',
  },
  xbox: {
    default: 'https://redeem.microsoft.com/',
  },
  roblox: {
    default: 'https://www.roblox.com/redeem',
  },
  steam: {
    default: 'https://store.steampowered.com/account/redeemwalletcode',
  },
};

/**
 * Brands that support pre-filling the code via URL query parameter.
 * Key = brand keyword (must match DIRECT_REDEEM_URLS), value = query param name.
 */
const CODE_QUERY_PARAMS: Record<string, string> = {
  amazon: 'claimCode',
  'google play': 'code',
  xbox: 'code',
  roblox: 'code',
};

function getDirectRedeemUrl(brandName: string | null | undefined, countryCode: string, cardCode?: string | null): string | null {
  if (!brandName) return null;
  const lower = brandName.toLowerCase();
  for (const [key, urls] of Object.entries(DIRECT_REDEEM_URLS)) {
    if (lower.includes(key)) {
      let url = urls[countryCode] ?? urls.default;
      const paramName = CODE_QUERY_PARAMS[key];
      if (paramName && cardCode) {
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}${paramName}=${encodeURIComponent(cardCode)}`;
      }
      return url;
    }
  }
  return null;
}

interface OrderBody {
  productId: number;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  customIdentifier?: string;
  senderName?: string;
  recipientEmail?: string;
}

/**
 * Internal endpoint for "deliver-first" gift card orders.
 * Protected by shared API key — NOT behind MPP.
 *
 * Flow: web-app calls this BEFORE building any payment tx.
 * If Reloadly fails → error returned, user never charged.
 * If Reloadly succeeds → returns result + payment details for tx building.
 */
export async function POST(request: NextRequest) {
  const key = request.headers.get('x-internal-key');
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: OrderBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.productId || typeof body.productId !== 'number' || !Number.isInteger(body.productId)) {
    return NextResponse.json({ error: 'productId must be a valid integer' }, { status: 400 });
  }
  if (!body.unitPrice || typeof body.unitPrice !== 'number' || body.unitPrice <= 0) {
    return NextResponse.json({ error: 'unitPrice must be a positive number' }, { status: 400 });
  }
  if (body.unitPrice > 100) {
    return NextResponse.json({ error: 'unitPrice cannot exceed $100 per order' }, { status: 400 });
  }

  const token = await getReloadlyToken();

  const orderRes = await fetchWithRetry(
    `${RELOADLY_BASE}/orders`,
    {
      method: 'POST',
      headers: reloadlyHeaders(token, 'v2'),
      body: JSON.stringify(body),
    },
    3,
  );

  if (!orderRes.ok) {
    const errorText = await orderRes.text().catch(() => '');
    let errorData: Record<string, unknown> = { message: 'Unknown error' };
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText || 'Unknown error' }; }
    const msg = (errorData.message as string) ?? 'Gift card order failed';
    console.error(`[reloadly/order-internal] Reloadly ${orderRes.status}: ${JSON.stringify(errorData)}`);
    console.error(`[reloadly/order-internal] Request body: ${JSON.stringify(body)}`);
    return NextResponse.json({ error: msg, detail: errorData }, { status: orderRes.status });
  }

  const result = (await orderRes.json()) as { transactionId?: number; product?: { productName?: string; currencyCode?: string } };
  const quantity = body.quantity ?? 1;
  const price = (body.unitPrice * quantity * (1 + SERVICE_FEE_RATE)).toFixed(2);

  const v2Headers = { ...reloadlyHeaders(token), accept: 'application/com.reloadly.giftcards-v2+json' };

  const [redeemData, instrData] = await Promise.all([
    result.transactionId
      ? fetch(`${RELOADLY_BASE}/orders/transactions/${result.transactionId}/cards`, {
          method: 'GET', headers: v2Headers,
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
    fetch(`${RELOADLY_BASE}/products/${body.productId}/redeem-instructions`, {
      method: 'GET', headers: reloadlyHeaders(token),
    }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const cards = Array.isArray(redeemData) ? redeemData : [];
  const card = cards[0] as { cardNumber?: string; pinCode?: string; redemptionUrl?: string } | undefined;

  const brandName = result.product?.productName ?? null;
  const directUrl = getDirectRedeemUrl(brandName, body.countryCode, card?.cardNumber);

  return NextResponse.json({
    success: true,
    result: {
      ...result,
      redeemInstructions: (instrData as { concise?: string })?.concise ?? null,
      cardNumber: card?.cardNumber ?? null,
      pinCode: card?.pinCode ?? null,
      redemptionUrl: directUrl ?? card?.redemptionUrl ?? null,
      brandName,
      localCurrency: result.product?.currencyCode ?? null,
      faceValue: body.unitPrice,
    },
    payment: {
      recipient: TREASURY_ADDRESS,
      currency: SUI_USDC_TYPE,
      amount: price,
    },
  });
}
