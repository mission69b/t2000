import { createHash, timingSafeEqual } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { env } from '@/lib/env';
import { getRunSecrets, isRunConfigured, setRunSecrets } from '@/lib/run';

// POST /serve/secrets — the per-agent handler secrets vault (S.695).
// Ops: `set` (merge; empty value deletes) · `list` (names only — values
// NEVER leave the gateway). Auth mirrors /serve/deploy: the agent signs
// `t2000-serve-secrets:{ts}:{sha256(canonical op payload)}` — or console
// attestation. Secrets are AES-256-GCM at rest and only ever injected into
// paid delivery payloads as `ctx.secrets`.

export const dynamic = 'force-dynamic';

const MAX_SKEW_MS = 5 * 60 * 1000;

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

/** Key-sorted stable stringify — the CLI mirrors this exactly. */
function canonicalUpdates(updates: Record<string, string>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(updates).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isRunConfigured()) {
    return err(503, 'Hosted handlers are temporarily unavailable.');
  }

  let body: {
    address?: string;
    op?: string;
    updates?: Record<string, string>;
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
  const op = body.op === 'list' ? 'list' : 'set';
  const updates: Record<string, string> = {};
  if (op === 'set') {
    if (
      !body.updates ||
      typeof body.updates !== 'object' ||
      Array.isArray(body.updates)
    ) {
      return err(400, 'updates must be an object of { NAME: value }.');
    }
    for (const [k, v] of Object.entries(body.updates)) {
      updates[String(k)] = String(v ?? '');
    }
    if (Object.keys(updates).length === 0) {
      return err(400, 'Provide at least one secret.');
    }
  }

  if (!consoleAttested(request)) {
    const ts = Number(body.timestamp);
    if (!(Number.isFinite(ts) && Math.abs(Date.now() - ts) <= MAX_SKEW_MS)) {
      return err(401, 'Stale or missing timestamp.');
    }
    const payload = op === 'list' ? 'list' : canonicalUpdates(updates);
    const bodyHash = createHash('sha256').update(payload).digest('hex');
    const message = `t2000-serve-secrets:${ts}:${bodyHash}`;
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

  if (op === 'list') {
    const secrets = await getRunSecrets(address);
    return Response.json({ ok: true, names: Object.keys(secrets).sort() });
  }

  const result = await setRunSecrets(address, updates);
  if ('error' in result) {
    return err(400, result.error);
  }
  return Response.json({ ok: true, names: result.names });
}
