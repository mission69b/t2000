import { NextResponse } from 'next/server';
import { ingestSeller, ingestSellerByUrl } from '@/lib/catalog-ingest';

export const dynamic = 'force-dynamic';

// [SPEC_T2_AGENTS_STORE] Zero-friction listing: POST { url } — a bare https
// URL, no account, no signature. The seller's own 402 challenge declares the
// payout wallet (= the listing identity); the gates are machine checks, not
// sign-ups. See lib/catalog-ingest.ts.
//
// Legacy: POST { address } (released `t2 agent list-catalog` / MCP
// `t2000_agent_sell {catalog:true}` clients) resolves the wallet's on-chain
// Agent ID endpoint, then runs the same URL ingest.
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

  let body: { url?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: CORS });
  }
  if (typeof body.url !== 'string' && typeof body.address !== 'string') {
    return NextResponse.json(
      { error: 'url is required (your paid API endpoint, https)' },
      { status: 400, headers: CORS },
    );
  }

  const result =
    typeof body.url === 'string'
      ? await ingestSellerByUrl(body.url)
      : await ingestSeller(body.address as string);
  const status = result.ok ? 200 : 422;
  return NextResponse.json(
    {
      ok: result.ok,
      gates: result.gates,
      ...(result.serviceId
        ? {
            serviceId: result.serviceId,
            url: `https://mpp.t2000.ai/services/${result.serviceId}`,
            ...(result.payTo ? { storeUrl: `https://agents.t2000.ai/${result.payTo}` } : {}),
          }
        : {}),
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      ...(result.removed ? { removed: true } : {}),
    },
    { status, headers: CORS },
  );
}
