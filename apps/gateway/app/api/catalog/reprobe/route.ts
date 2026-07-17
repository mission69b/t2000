import { NextResponse } from 'next/server';
import { reprobeAll } from '@/lib/catalog-ingest';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily re-probe cron (vercel.json). Runs the live-402 + payTo gates against
 * every dynamic catalog entry; 3 consecutive failures suspend (hide) the
 * entry, a passing probe recovers it. Vercel cron authenticates with
 * `Authorization: Bearer ${CRON_SECRET}`; unset secret → 503, fail closed.
 */
export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summary = await reprobeAll();
  console.log('[catalog] reprobe', JSON.stringify(summary));
  return NextResponse.json(summary);
}
