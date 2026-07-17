import { NextResponse } from 'next/server';
import { previewSeller } from '@/lib/catalog-ingest';

export const dynamic = 'force-dynamic';

// [SPEC_T2_AGENTS_STORE] Dry-run for the /sell page: runs every gate +
// enumeration + the listing-quality grade against a URL, writes NOTHING.
// Shares previewSeller() with the ingest write path, so preview and listing
// can never disagree.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
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

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: CORS });
  }
  if (typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'url is required (your paid API endpoint, https)' },
      { status: 400, headers: CORS },
    );
  }

  const result = await previewSeller(body.url);
  return NextResponse.json(
    {
      ok: result.ok,
      gates: result.gates,
      ...(result.service ? { service: result.service } : {}),
      ...(result.payTo ? { payTo: result.payTo } : {}),
      warnings: result.warnings,
    },
    { status: result.ok ? 200 : 422, headers: CORS },
  );
}
