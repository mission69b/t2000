import { getCatalog } from './catalog-live';
import { verifyAndLogDirectPayment } from './report-payment';
import type { Service } from './services';

// ---------------------------------------------------------------------------
// Direct-seller CORS relay.
//
// Direct sellers (catalog federation) run on their OWN origin, and most of
// them serve no CORS headers (JMPR: OPTIONS → 405, no ACAO — live finding
// 2026-07-17). Browser payers (the agents.t2000.ai try-it card, Audric's
// in-chat pay_service) die on "Failed to fetch" before the 402 handshake
// starts. CLI/MCP callers are unaffected (no browser, no CORS).
//
// This relay is a dumb pass-through pinned to the catalog: browser calls
// /api/relay/<serviceId>/<path>, the gateway forwards to the seller's own
// origin and mirrors the response back with the gateway's permissive CORS.
// Payment still settles CLIENT → SELLER (the 402 challenge, the payment
// credential, and the settle receipt all pass through untouched) — the
// gateway never holds funds and takes no margin; it's the rail.
//
// NOT an open proxy: the service must be a cataloged direct seller and the
// path must match one of its LISTED endpoint templates. Everything else 404s.
//
// Ledger: the SDK's client-side /api/mpp/report skips gateway-origin URLs
// (it assumes gateway-origin == proxied == already logged), so relayed
// payments would go blind. The relay closes that itself: it extracts the
// settlement digest from either dialect (MPP header credential on the
// request, x402 X-PAYMENT-RESPONSE on the response) and runs the SAME
// chain-verified writer the report route uses. The digest unique constraint
// keeps a client report + a relay log idempotent.
// ---------------------------------------------------------------------------

/** Headers forwarded UPSTREAM (allowlist — never forward cookies/host). */
const FORWARD_REQUEST_HEADERS = ['content-type', 'accept', 'authorization', 'x-payment'];

/** Headers mirrored back DOWNSTREAM (payment dialect + body metadata). */
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'www-authenticate',
  'x-payment-response',
  'payment-receipt',
];

export function relayCorsHeaders(req: Request): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers':
      req.headers.get('access-control-request-headers') ?? '*',
    // mppx/x402 clients must READ the challenge + receipt headers from JS.
    'access-control-expose-headers': '*',
    'access-control-max-age': '86400',
  };
}

/** A concrete path matches a listed one exactly, or segment-for-segment
 *  against a `{param}` template (same segment count, statics equal). */
export function pathMatchesListed(concrete: string, listed: string): boolean {
  if (concrete === listed) return true;
  const c = concrete.split('/');
  const l = listed.split('/');
  if (c.length !== l.length) return false;
  return l.every((seg, i) => (seg.startsWith('{') && seg.endsWith('}')) || seg === c[i]);
}

/** Resolve the relay target: cataloged direct seller + listed path, or null. */
export async function resolveRelayTarget(
  serviceId: string,
  path: string,
): Promise<{ service: Service; url: string } | null> {
  const catalog = await getCatalog();
  const service = catalog.find((s) => s.id === serviceId && s.direct === true);
  if (!service) return null;
  const listed = service.endpoints.some((e) => pathMatchesListed(path, e.path));
  if (!listed) return null;
  return { service, url: `${service.serviceUrl}${path}` };
}

/** Settlement digest from the MPP header dialect: the retry carries
 *  `Authorization: Payment <base64 credential>` whose payload is
 *  `{ digest, signature }` (client already broadcast the transfer). */
export function digestFromMppCredential(authHeader: string | null): string | undefined {
  if (!authHeader) return undefined;
  const match = authHeader.match(/^Payment\s+(.+)$/i);
  if (!match?.[1]) return undefined;
  try {
    const json = Buffer.from(match[1], 'base64').toString('utf8');
    const payload = (JSON.parse(json) as { payload?: { digest?: unknown } }).payload;
    return typeof payload?.digest === 'string' ? payload.digest : undefined;
  } catch {
    return undefined;
  }
}

/** Settlement digest from the x402 dialect: the upstream response carries
 *  `X-PAYMENT-RESPONSE: base64({ transaction })` after the seller settles. */
export function digestFromX402Response(header: string | null): string | undefined {
  if (!header) return undefined;
  try {
    const json = Buffer.from(header, 'base64').toString('utf8');
    const tx = (JSON.parse(json) as { transaction?: unknown }).transaction;
    return typeof tx === 'string' ? tx : undefined;
  } catch {
    return undefined;
  }
}

export interface RelayOutcome {
  response: Response;
  /** Chain-verified ledger write to run AFTER the response is sent
   *  (next/server `after()` in the route) — undefined when nothing settled. */
  logSettlement?: () => Promise<void>;
}

/** Forward `req` to the seller and mirror the response with CORS. */
export async function relayToSeller(
  req: Request,
  serviceId: string,
  path: string,
): Promise<RelayOutcome> {
  const cors = relayCorsHeaders(req);
  const target = await resolveRelayTarget(serviceId, path);
  if (!target) {
    return {
      response: Response.json(
        { error: 'not a cataloged direct-seller endpoint' },
        { status: 404, headers: cors },
      ),
    };
  }

  const upstreamHeaders = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const search = new URL(req.url).search;

  let upstream: Response;
  try {
    upstream = await fetch(`${target.url}${search}`, {
      method,
      headers: upstreamHeaders,
      body: hasBody ? await req.text() : undefined,
    });
  } catch {
    return {
      response: Response.json(
        { error: 'the seller did not answer — nothing was charged by the relay' },
        { status: 502, headers: cors },
      ),
    };
  }

  const responseHeaders = new Headers(cors);
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  const body = await upstream.arrayBuffer();
  const response = new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  });

  // Settlement evidence — only meaningful on a delivered (2xx) response.
  const digest =
    upstream.status >= 200 && upstream.status < 300
      ? (digestFromX402Response(upstream.headers.get('x-payment-response')) ??
        digestFromMppCredential(req.headers.get('authorization')))
      : undefined;

  return {
    response,
    logSettlement: digest
      ? async () => {
          // Same chain-verified writer as /api/mpp/report — the digest is a
          // pointer; amount + sender come from the chain. Never throws.
          try {
            await verifyAndLogDirectPayment({ digest, url: target.url });
          } catch (err) {
            console.error('[relay] settlement log failed:', err);
          }
        }
      : undefined,
  };
}
