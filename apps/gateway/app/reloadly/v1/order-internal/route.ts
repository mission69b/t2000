import { NextRequest, NextResponse } from 'next/server';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders, SERVICE_FEE_RATE } from '@/lib/reloadly';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from '@/lib/constants';
import { fetchWithRetry } from '@/lib/gateway';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

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
      headers: reloadlyHeaders(token),
      body: JSON.stringify(body),
    },
    3,
  );

  if (!orderRes.ok) {
    const errorData = await orderRes.json().catch(() => ({ message: 'Unknown error' }));
    const msg = (errorData as { message?: string }).message ?? 'Gift card order failed';
    return NextResponse.json({ error: msg, detail: errorData }, { status: orderRes.status });
  }

  const result = await orderRes.json();
  const quantity = body.quantity ?? 1;
  const price = (body.unitPrice * quantity * (1 + SERVICE_FEE_RATE)).toFixed(2);

  return NextResponse.json({
    success: true,
    result,
    payment: {
      recipient: TREASURY_ADDRESS,
      currency: SUI_USDC_TYPE,
      amount: price,
    },
  });
}
