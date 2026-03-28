import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry } from '@/lib/gateway';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from '@/lib/constants';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;
const SERVICE_FEE_RATE = 0.05;

const storeHeaders = () => ({
  authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
  'content-type': 'application/json',
  'x-pf-store-id': process.env.PRINTFUL_STORE_ID ?? '',
});

/**
 * Internal endpoint for "deliver-first" Printful orders.
 * Protected by shared API key — NOT behind MPP.
 *
 * Flow:
 * 1. Estimate cost via Printful API
 * 2. Place order via Printful API
 * 3. If either fails → error returned, user never charged
 * 4. If both succeed → return result + payment details for tx building
 */
export async function POST(request: NextRequest) {
  const key = request.headers.get('x-internal-key');
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.recipient || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Order must include recipient and at least one item' }, { status: 400 });
  }

  const bodyText = JSON.stringify(body);

  const estimateRes = await fetch('https://api.printful.com/orders/estimate-costs', {
    method: 'POST',
    headers: storeHeaders(),
    body: bodyText,
  });

  if (!estimateRes.ok) {
    const errData = await estimateRes.json().catch(() => ({ message: 'Estimate failed' }));
    const msg = (errData as { result?: string; error?: { message?: string } }).error?.message
      ?? (errData as { message?: string }).message
      ?? `Printful estimate failed (${estimateRes.status})`;
    console.error(`[printful/order-internal] Estimate failed (${estimateRes.status}):`, msg);
    return NextResponse.json({ error: msg }, { status: estimateRes.status });
  }

  const estimate = await estimateRes.json() as {
    result?: { costs?: { total?: string; subtotal?: string; shipping?: string } };
  };
  const estimatedTotal = parseFloat(estimate.result?.costs?.total ?? '0');
  if (estimatedTotal <= 0) {
    return NextResponse.json({ error: 'Could not estimate order cost' }, { status: 400 });
  }

  if (estimatedTotal > 200) {
    return NextResponse.json(
      { error: `Order total $${estimatedTotal.toFixed(2)} exceeds $200 limit` },
      { status: 400 },
    );
  }

  const orderRes = await fetchWithRetry('https://api.printful.com/orders', {
    method: 'POST',
    headers: storeHeaders(),
    body: bodyText,
  });

  if (!orderRes.ok) {
    const errData = await orderRes.json().catch(() => ({ message: 'Order failed' }));
    const msg = (errData as { result?: string; error?: { message?: string } }).error?.message
      ?? (errData as { message?: string }).message
      ?? `Printful order failed (${orderRes.status})`;
    console.error(`[printful/order-internal] Order failed (${orderRes.status}):`, msg);
    return NextResponse.json({ error: msg, detail: errData }, { status: orderRes.status });
  }

  const result = await orderRes.json();
  const price = (estimatedTotal * (1 + SERVICE_FEE_RATE)).toFixed(2);

  return NextResponse.json({
    success: true,
    result,
    estimate: estimate.result?.costs,
    payment: {
      recipient: TREASURY_ADDRESS,
      currency: SUI_USDC_TYPE,
      amount: price,
    },
  });
}
