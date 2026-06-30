import { createHash } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import {
  isDeployConfigured,
  isSafeUpstreamUrl,
  removeDeployedService,
  storeDeployedService,
} from '@/lib/deploy';

// POST /deploy/config — Agent Deploy (Option A) config store. The agent signs a
// fresh, config-bound message with its keypair; the gateway verifies + stores
// the upstream proxy config (headers encrypted at rest). DELETE removes it.
// Stateless auth: sign `t2000-deploy:{ts}:{sha256(body-fields)}` — freshness
// (±5 min) + the body hash bind the signature to this exact config, so a
// captured signature can't write a different one. No public proxy URL is
// exposed; the upstream is only ever called from within the paid commerce flow.

export const dynamic = 'force-dynamic';

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_HEADERS = 12;
const MAX_HEADER_LEN = 2048;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status });
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
    return normalizeSuiAddress(pk.toSuiAddress()) === normalizeSuiAddress(address);
  } catch {
    return false;
  }
}

function freshTimestamp(ts: unknown): boolean {
  const n = Number(ts);
  return Number.isFinite(n) && Math.abs(Date.now() - n) <= MAX_SKEW_MS;
}

export async function POST(request: Request): Promise<Response> {
  if (!isDeployConfigured()) {
    return err(503, 'Agent Deploy is temporarily unavailable.');
  }

  let body: {
    address?: string;
    timestamp?: number;
    signature?: string;
    upstreamUrl?: string;
    method?: string;
    headers?: Record<string, string>;
  };
  try {
    body = await request.json();
  } catch {
    return err(400, 'Bad request.');
  }

  const address = normalizeSuiAddress(String(body.address ?? '').trim());
  const upstreamUrl = String(body.upstreamUrl ?? '').trim();
  const method = String(body.method ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
  const headers = body.headers ?? {};

  if (!isValidSuiAddress(address)) {
    return err(400, 'A valid agent Sui address is required.');
  }
  if (!freshTimestamp(body.timestamp)) {
    return err(401, 'Stale or missing timestamp.');
  }
  if (!isSafeUpstreamUrl(upstreamUrl)) {
    return err(400, 'upstreamUrl must be a valid public https URL.');
  }
  const headerEntries = Object.entries(headers);
  if (
    headerEntries.length > MAX_HEADERS ||
    headerEntries.some(
      ([k, v]) => !k || typeof v !== 'string' || v.length > MAX_HEADER_LEN,
    )
  ) {
    return err(400, 'Invalid headers.');
  }

  // The signed message binds to the exact config (body hash).
  const bodyHash = createHash('sha256')
    .update(`${upstreamUrl}|${method}|${JSON.stringify(headers)}`)
    .digest('hex');
  const message = `t2000-deploy:${body.timestamp}:${bodyHash}`;
  if (!(await verifySig(address, message, String(body.signature ?? '')))) {
    return err(401, 'Invalid signature.');
  }

  await storeDeployedService(address, { upstreamUrl, method, headers });
  return Response.json({ ok: true, address });
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isDeployConfigured()) {
    return err(503, 'Agent Deploy is temporarily unavailable.');
  }
  let body: { address?: string; timestamp?: number; signature?: string };
  try {
    body = await request.json();
  } catch {
    return err(400, 'Bad request.');
  }
  const address = normalizeSuiAddress(String(body.address ?? '').trim());
  if (!isValidSuiAddress(address)) {
    return err(400, 'A valid agent Sui address is required.');
  }
  if (!freshTimestamp(body.timestamp)) {
    return err(401, 'Stale or missing timestamp.');
  }
  const message = `t2000-deploy-remove:${body.timestamp}`;
  if (!(await verifySig(address, message, String(body.signature ?? '')))) {
    return err(401, 'Invalid signature.');
  }
  await removeDeployedService(address);
  return Response.json({ ok: true, address });
}
