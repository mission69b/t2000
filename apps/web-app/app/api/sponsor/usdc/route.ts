import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

const SERVER_URL = process.env.SERVER_URL ?? 'https://api.t2000.ai';
const SPONSOR_INTERNAL_KEY = process.env.SPONSOR_INTERNAL_KEY ?? '';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { address } = body as { address?: string };

    if (!address) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 });
    }

    const headersList = await headers();
    const callerIp = headersList.get('x-forwarded-for')
      ?? headersList.get('x-real-ip')
      ?? '127.0.0.1';

    const res = await fetch(`${SERVER_URL}/api/sponsor/usdc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': SPONSOR_INTERNAL_KEY,
        'x-forwarded-for': callerIp,
      },
      body: JSON.stringify({ address, source: 'web' }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/sponsor/usdc] Error:', err);
    return NextResponse.json({ error: 'Sponsorship request failed' }, { status: 500 });
  }
}
