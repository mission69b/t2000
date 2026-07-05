import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

// Gateway-hosted seller endpoints (§II.13.B "report-grade seeds").
//
// Payment enforcement: the routes under app/sellers/* are technically public
// URLs, so without a gate anyone could call them and skip the x402 payment.
// The commerce delivery leg (app/commerce/pay/[seller]) injects a signed
// `x-t2000-delivery` header on EVERY delivery: `<ts>.<sig>` where
// sig = HMAC-SHA256(key, `${ts}|${target origin+path}`).
//
// Properties:
// - No per-seed secrets to distribute — the key derives from INTERNAL_API_KEY
//   (same pattern as the deploy header encryption; no new env var).
// - Binding to the TARGET URL means a malicious seller who logs the header on
//   their own deliveries cannot replay it against our seed routes (path
//   mismatch), and freshness bounds any replay window.
// - External sellers get the same header for free — presence + verification
//   proves the call came through the paid delivery leg.

export const DELIVERY_AUTH_HEADER = 'x-t2000-delivery';
const FRESHNESS_MS = 120_000;

function deliveryKey(): Buffer {
  return createHash('sha256')
    .update(`${env.INTERNAL_API_KEY}:delivery-auth-v1`)
    .digest();
}

/** Normalize a URL to the signed surface: lowercase origin + pathname (query
 *  excluded — buyer input rides the body/query and must not break the bind). */
function signedTarget(rawUrl: string): string {
  const u = new URL(rawUrl);
  return `${u.origin.toLowerCase()}${u.pathname.toLowerCase()}`;
}

/** Sign a delivery to `targetUrl` (called by the commerce delivery leg). */
export function signDelivery(targetUrl: string, now = Date.now()): string {
  const sig = createHmac('sha256', deliveryKey())
    .update(`${now}|${signedTarget(targetUrl)}`)
    .digest('hex');
  return `${now}.${sig}`;
}

/** Verify the delivery header on an incoming request to a gateway-hosted
 *  seller route. True only for a fresh header signed for THIS route. */
export function verifyDelivery(req: Request): boolean {
  const header = req.headers.get(DELIVERY_AUTH_HEADER) ?? '';
  const dot = header.indexOf('.');
  if (dot <= 0) {
    return false;
  }
  const ts = Number.parseInt(header.slice(0, dot), 10);
  const sig = header.slice(dot + 1);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > FRESHNESS_MS) {
    return false;
  }
  const expected = createHmac('sha256', deliveryKey())
    .update(`${ts}|${signedTarget(req.url)}`)
    .digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Buyer input → query params for GET upstreams (S.638). POST upstreams get
// the buyer's `--data` as the body; GET upstreams historically dropped it,
// which made every wrapped GET API static. Flatten the top-level primitive
// fields of the buyer's JSON into query params — bounded, and NEVER
// overriding a param the seller saved in the upstream URL (fixed filters or
// query-string keys stay seller-controlled). The delivery signature is
// unaffected by design: `signedTarget` excludes the query string.
const MAX_BUYER_PARAMS = 8;
const MAX_PARAM_KEY_LEN = 64;
const MAX_PARAM_VALUE_LEN = 512;

/** Merge buyer JSON input into a GET upstream's query string. Returns the
 *  URL unchanged when input is absent, invalid JSON, or not an object. */
export function appendBuyerParams(upstreamUrl: string, body: string): string {
  if (!body) {
    return upstreamUrl;
  }
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return upstreamUrl;
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return upstreamUrl;
  }
  const url = new URL(upstreamUrl);
  let added = 0;
  for (const [key, value] of Object.entries(input)) {
    if (added >= MAX_BUYER_PARAMS) {
      break;
    }
    const primitive =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean';
    if (
      !primitive ||
      key.length > MAX_PARAM_KEY_LEN ||
      String(value).length > MAX_PARAM_VALUE_LEN ||
      url.searchParams.has(key)
    ) {
      continue;
    }
    url.searchParams.append(key, String(value));
    added += 1;
  }
  return url.toString();
}

/** 402-flavored refusal for direct (unpaid) calls to a seller route. */
export function paymentRequired(sellerAddress?: string): Response {
  return Response.json(
    {
      error:
        'This is a paid agent service — call it through the t2000 rail, not directly.',
      howToBuy: sellerAddress
        ? `t2 agent pay ${sellerAddress}`
        : 'Find the agent on https://agents.t2000.ai and pay via `t2 agent pay <address>` (or any Sui-x402 client).',
    },
    { status: 402 },
  );
}
