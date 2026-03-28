import { NextRequest, NextResponse } from 'next/server';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from '@/lib/constants';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;
const LOB_BASE = 'https://api.lob.com/v1';

function lobAuth(): string {
  return `Basic ${Buffer.from((process.env.LOB_API_KEY ?? '') + ':').toString('base64')}`;
}

interface MailBody {
  type: 'postcard' | 'letter';
  price: string;
  payload: Record<string, unknown>;
}

/**
 * Internal endpoint for "deliver-first" Lob mail (postcards + letters).
 * Protected by shared API key — NOT behind MPP.
 *
 * Flow: web-app calls this BEFORE building any payment tx.
 * If Lob fails → error returned, user never charged.
 * If Lob succeeds → returns result + payment details for tx building.
 */
export async function POST(request: NextRequest) {
  const key = request.headers.get('x-internal-key');
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: MailBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.type || !['postcard', 'letter'].includes(body.type)) {
    return NextResponse.json({ error: 'type must be "postcard" or "letter"' }, { status: 400 });
  }
  if (!body.payload || typeof body.payload !== 'object') {
    return NextResponse.json({ error: 'payload is required' }, { status: 400 });
  }

  const lobEndpoint = body.type === 'postcard' ? `${LOB_BASE}/postcards` : `${LOB_BASE}/letters`;

  const lobRes = await fetch(lobEndpoint, {
    method: 'POST',
    headers: {
      authorization: lobAuth(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body.payload),
  });

  if (!lobRes.ok) {
    const errData = await lobRes.json().catch(() => ({ message: 'Lob request failed' }));
    const msg = (errData as { error?: { message?: string }; message?: string }).error?.message
      ?? (errData as { message?: string }).message
      ?? `Lob error (${lobRes.status})`;
    console.error(`[lob/mail-internal] Lob ${body.type} failed (${lobRes.status}):`, msg);
    return NextResponse.json({ error: msg, detail: errData }, { status: lobRes.status });
  }

  const result = await lobRes.json();

  return NextResponse.json({
    success: true,
    result,
    payment: {
      recipient: TREASURY_ADDRESS,
      currency: SUI_USDC_TYPE,
      amount: body.price,
    },
  });
}
