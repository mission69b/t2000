import { createHash, timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import {
  isRunConfigured,
  MAX_SCRIPT_BYTES,
  scriptNameFor,
  uploadRunScript,
} from '@/lib/run';

// POST /serve/deploy — R1 hosted handlers (SPEC_AGENT_RUNTIME §2, S.694).
// The seller's CLI bundles handler+shim into ONE ES module and uploads it
// here; the gateway PUTs it into the Workers-for-Platforms dispatch
// namespace and records the RunDeployment row that delivery resolution
// reads. Auth mirrors /deploy/config: the agent signs
// `t2000-serve:{ts}:{sha256(slug|scriptBase64)}` (freshness ±5 min; the
// body hash binds the signature to this exact script) — OR the console
// attests a Passport session via x-console-proxy.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

async function verifySig(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    const pk = await verifyPersonalMessageSignature(
      new TextEncoder().encode(message),
      signature,
    );
    return (
      normalizeSuiAddress(pk.toSuiAddress()) === normalizeSuiAddress(address)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isRunConfigured()) {
    return err(503, 'Hosted handlers are temporarily unavailable.');
  }

  let body: {
    address?: string;
    slug?: string;
    script?: string; // base64 of the bundled ES module
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
    return err(400, 'Invalid service slug ([a-z0-9-], 2–40 chars).');
  }
  const scriptB64 = String(body.script ?? '');
  if (!scriptB64) {
    return err(400, 'script (base64 ES module) is required.');
  }
  let script: string;
  try {
    script = Buffer.from(scriptB64, 'base64').toString('utf8');
  } catch {
    return err(400, 'script must be valid base64.');
  }
  const sizeBytes = Buffer.byteLength(script, 'utf8');
  if (sizeBytes === 0 || sizeBytes > MAX_SCRIPT_BYTES) {
    return err(
      400,
      `Bundled script must be 1 byte – ${Math.floor(MAX_SCRIPT_BYTES / 1000)} KB.`,
    );
  }

  if (!consoleAttested(request)) {
    const ts = Number(body.timestamp);
    if (!(Number.isFinite(ts) && Math.abs(Date.now() - ts) <= MAX_SKEW_MS)) {
      return err(401, 'Stale or missing timestamp.');
    }
    const bodyHash = createHash('sha256')
      .update(`${slug}|${scriptB64}`)
      .digest('hex');
    const message = `t2000-serve:${ts}:${bodyHash}`;
    if (!(await verifySig(address, message, String(body.signature ?? '')))) {
      return err(401, 'Signature does not match the agent address.');
    }
  }

  const upload = await uploadRunScript(address, slug, script);
  if (!upload.ok) {
    return err(502, upload.error ?? 'Upload failed.');
  }

  await prisma.runDeployment.upsert({
    where: { agent_slug: { agent: address, slug } },
    create: {
      agent: address,
      slug,
      scriptName: scriptNameFor(address, slug),
      sizeBytes,
      active: true,
    },
    update: { sizeBytes, active: true },
  });

  return Response.json({
    ok: true,
    slug,
    sizeBytes,
    buyUrl: `https://x402.t2000.ai/commerce/pay/${address}/${slug}`,
  });
}
