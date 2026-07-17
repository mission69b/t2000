import { NextResponse } from 'next/server';
import { ingestSeller } from '@/lib/catalog-ingest';

export const dynamic = 'force-dynamic';

// CLI / MCP / console all POST here — signature-free by design: the input is
// only a Sui address, and authorization is the seller's own on-chain Agent ID
// record (mcpEndpoint is set by a seller-signed sponsored tx). See
// lib/catalog-ingest.ts for the gates.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Per-instance probe-spam brake: each submit costs two chain reads + live
// fetches against the seller's origin. Serverless instances don't share the
// map, which is fine — this only needs to slow a tight loop, not meter.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const slot = hits.get(ip);
  if (!slot || now - slot.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  slot.count += 1;
  return slot.count > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'rate limited — try again in a minute' },
      { status: 429, headers: CORS },
    );
  }

  let body: { address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: CORS });
  }
  if (typeof body.address !== 'string') {
    return NextResponse.json(
      { error: 'address is required (the seller Agent ID wallet)' },
      { status: 400, headers: CORS },
    );
  }

  const result = await ingestSeller(body.address);
  const status = result.ok ? 200 : 422;
  return NextResponse.json(
    {
      ok: result.ok,
      gates: result.gates,
      ...(result.serviceId
        ? { serviceId: result.serviceId, url: `https://mpp.t2000.ai/services/${result.serviceId}` }
        : {}),
      ...(result.removed ? { removed: true } : {}),
    },
    { status, headers: CORS },
  );
}
