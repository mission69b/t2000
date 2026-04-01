import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/quote — deprecated, returns 410 Gone.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Savings yield is USDC-only via NAVI; use the in-app Save flow or agent rate tools.' },
    { status: 410 },
  );
}
