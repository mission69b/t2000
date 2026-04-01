import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/quote — deprecated, returns 410 Gone.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Use rebalance for yield optimization.' },
    { status: 410 },
  );
}
