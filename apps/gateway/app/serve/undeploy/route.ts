import { timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { deleteRunScript, isRunConfigured } from '@/lib/run';

// POST /serve/undeploy — remove a hosted handler (S.694). Deletes the user
// Worker from the dispatch namespace + deactivates the RunDeployment row.
// Auth: `t2000-serve-remove:{ts}:{slug}` signed by the agent — or console
// attestation. Idempotent.

export const dynamic = 'force-dynamic';

const MAX_SKEW_MS = 5 * 60 * 1000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function consoleAttested(req: Request): boolean {
  const expected = env.BOARD_POSTER_PROXY_KEY ?? '';
  const got = req.headers.get('x-console-proxy') ?? '';
  if (!(expected && got)) {
    return false;
  }
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!isRunConfigured()) {
    return err(503, 'Hosted handlers are temporarily unavailable.');
  }

  let body: {
    address?: string;
    slug?: string;
    timestamp?: number;
    signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return err(400, 'Invalid JSON body.');
  }

  const address = normalizeSuiAddress(String(body.address ?? '').trim());
  if (!isValidSuiAddress(address)) {
    return err(400, 'A valid agent Sui address is required.');
  }
  const slug = String(body.slug ?? '')
    .trim()
    .toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return err(400, 'Invalid service slug.');
  }

  if (!consoleAttested(request)) {
    const ts = Number(body.timestamp);
    if (!(Number.isFinite(ts) && Math.abs(Date.now() - ts) <= MAX_SKEW_MS)) {
      return err(401, 'Stale or missing timestamp.');
    }
    const message = `t2000-serve-remove:${ts}:${slug}`;
    let ok = false;
    try {
      const pk = await verifyPersonalMessageSignature(
        new TextEncoder().encode(message),
        String(body.signature ?? ''),
      );
      ok =
        normalizeSuiAddress(pk.toSuiAddress()) === normalizeSuiAddress(address);
    } catch {
      ok = false;
    }
    if (!ok) {
      return err(401, 'Signature does not match the agent address.');
    }
  }

  await deleteRunScript(address, slug);
  await prisma.runDeployment
    .update({
      where: { agent_slug: { agent: address, slug } },
      data: { active: false },
    })
    .catch(() => undefined);

  return Response.json({ ok: true, slug, undeployed: true });
}
