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

    // Step 4: Try Uber Eats US $20 order
    const uberBody = {
      productId: 13044,
      quantity: 1,
      unitPrice: 20,
      customIdentifier: `t2000-debug-uber-${Date.now()}`,
      senderName: 't2000',
      recipientEmail: 'funkii@mission69b.com',
    };
    const uberRes = await fetch(`${RELOADLY_BASE}/orders`, {
      method: 'POST',
      headers: reloadlyHeaders(token),
      body: JSON.stringify(uberBody),
    });
    const uberText = await uberRes.text();
    diagnostics.uberEats = {
      status: uberRes.status,
      response: (() => { try { return JSON.parse(uberText); } catch { return uberText; } })(),
    };

    // Step 5: Try a second product — lookup product 2 (likely a common US card)
    const prod2Res = await fetch(`${RELOADLY_BASE}/products/2`, {
      method: 'GET',
      headers: reloadlyHeaders(token),
    });
    if (prod2Res.ok) {
      const p2 = (await prod2Res.json()) as { productId: number; productName: string; denominationType: string; minRecipientDenomination?: number; fixedRecipientDenominations?: number[] };
      const price = p2.denominationType === 'FIXED'
        ? (p2.fixedRecipientDenominations?.[0] ?? 5)
        : (p2.minRecipientDenomination ?? 5);
      const body2 = {
        productId: p2.productId,
        quantity: 1,
        unitPrice: price,
        customIdentifier: `t2000-debug-alt-${Date.now()}`,
        senderName: 't2000',
        recipientEmail: 'funkii@mission69b.com',
      };
      diagnostics.altProduct = { id: p2.productId, name: p2.productName, denom: p2.denominationType, price };
      const altRes = await fetch(`${RELOADLY_BASE}/orders`, {
        method: 'POST',
        headers: reloadlyHeaders(token),
        body: JSON.stringify(body2),
      });
      const altText = await altRes.text();
      diagnostics.altOrder = {
        status: altRes.status,
        response: (() => { try { return JSON.parse(altText); } catch { return altText; } })(),
      };
    }

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (err) {
    diagnostics.error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(diagnostics, { status: 500 });
  }
}
