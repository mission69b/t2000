import { NextRequest, NextResponse } from 'next/server';
import { logPayment } from '@/lib/log-payment';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

/**
 * Internal-only endpoint for logging payments from deliver-first flows.
 * Protected by shared API key — NOT publicly accessible.
 */
export async function POST(request: NextRequest) {
  const key = request.headers.get('x-internal-key');
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { service: string; endpoint: string; amount: string; digest: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.service || !body.endpoint || !body.amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await logPayment(body);

  return NextResponse.json({ ok: true });
}
