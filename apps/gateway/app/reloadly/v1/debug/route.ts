import { NextRequest, NextResponse } from 'next/server';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders } from '@/lib/reloadly';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

/**
 * GET /reloadly/v1/debug?key=INTERNAL_API_KEY
 *
 * Diagnostic endpoint — tests Reloadly auth, balance, product lookup, and a $5 test order.
 * Protected by internal API key as query param.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const diagnostics: Record<string, unknown> = { timestamp: new Date().toISOString() };

  try {
    // Step 1: Auth
    const token = await getReloadlyToken();
    diagnostics.auth = 'OK';

    // Step 2: Account balance
    const balRes = await fetch(`${RELOADLY_BASE}/accounts/balance`, {
      method: 'GET',
      headers: reloadlyHeaders(token),
    });
    if (balRes.ok) {
      diagnostics.accountBalance = await balRes.json();
    } else {
      diagnostics.accountBalance = { error: balRes.status, body: await balRes.text().catch(() => '') };
    }

    // Step 3: Lookup Uber Eats US (product 13044)
    const prodRes = await fetch(`${RELOADLY_BASE}/products/13044`, {
      method: 'GET',
      headers: reloadlyHeaders(token),
    });
    if (prodRes.ok) {
      const prod = await prodRes.json();
      diagnostics.product = {
        id: prod.productId,
        name: prod.productName,
        denominationType: prod.denominationType,
        min: prod.minRecipientDenomination,
        max: prod.maxRecipientDenomination,
        fixedDenoms: prod.fixedRecipientDenominations,
        senderFee: prod.senderFee,
        senderCurrencyCode: prod.senderCurrencyCode,
        available: prod.supportsPreOrder ?? null,
        country: prod.country,
      };
    } else {
      diagnostics.product = { error: prodRes.status, body: await prodRes.text().catch(() => '') };
    }

    // Step 4: Try a $20 order (within $15-$100 range) — Uber Eats US
    const orderBody = {
      productId: 13044,
      quantity: 1,
      unitPrice: 20,
      customIdentifier: `t2000-debug-${Date.now()}`,
      senderName: 't2000',
      recipientEmail: 'funkii@mission69b.com',
    };

    diagnostics.orderRequest = orderBody;

    const orderRes = await fetch(`${RELOADLY_BASE}/orders`, {
      method: 'POST',
      headers: reloadlyHeaders(token),
      body: JSON.stringify(orderBody),
    });

    diagnostics.orderStatus = orderRes.status;

    const orderText = await orderRes.text();
    try {
      diagnostics.orderResponse = JSON.parse(orderText);
    } catch {
      diagnostics.orderResponse = orderText;
    }

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (err) {
    diagnostics.error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(diagnostics, { status: 500 });
  }
}
