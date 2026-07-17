import { NextResponse } from 'next/server';
import { getEntry, listEntries, putEntry, removeEntry } from '@/lib/catalog-store';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Operator moderation lever (Bearer INTERNAL_API_KEY):
 *   GET                                → all dynamic entries (any state)
 *   POST { action: 'delist',  address } → hide, terminal until cleared
 *   POST { action: 'remove',  address } → delete the entry (also = appeal
 *                                         approved: the seller resubmits fresh)
 */
function authorized(req: Request): boolean {
  return req.headers.get('authorization') === `Bearer ${env.INTERNAL_API_KEY}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ entries: await listEntries() });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { action?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.address !== 'string' || (body.action !== 'delist' && body.action !== 'remove')) {
    return NextResponse.json(
      { error: "action must be 'delist' | 'remove' and address a string" },
      { status: 400 },
    );
  }
  const address = body.address.toLowerCase();

  if (body.action === 'remove') {
    await removeEntry(address);
    return NextResponse.json({ ok: true, removed: true });
  }

  const entry = await getEntry(address);
  if (!entry) {
    return NextResponse.json({ error: 'no entry for that address' }, { status: 404 });
  }
  await putEntry({ ...entry, state: 'delisted', updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, state: 'delisted' });
}
