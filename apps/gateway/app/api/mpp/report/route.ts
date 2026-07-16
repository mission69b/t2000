import { NextResponse } from 'next/server';
import { verifyAndLogDirectPayment } from '@/lib/report-payment';

export const dynamic = 'force-dynamic';

// Browser SDK consumers (e.g. Audric's in-browser zkLogin payer) report
// cross-origin; the endpoint is safe to open — it only records what the
// chain proves.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Direct-seller payment report (S.743). Clients POST `{ digest, url }` after
 * a paid call to a cataloged direct seller; the row is written only after
 * on-chain verification (see lib/report-payment.ts). The digest column's
 * unique constraint makes duplicate reports idempotent.
 */
export async function POST(req: Request) {
  let body: { digest?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: CORS });
  }
  if (typeof body.digest !== 'string' || typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'digest and url are required strings' },
      { status: 400, headers: CORS },
    );
  }

  const outcome = await verifyAndLogDirectPayment({ digest: body.digest, url: body.url });
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: CORS });
  }
  return NextResponse.json({ recorded: true }, { headers: CORS });
}
