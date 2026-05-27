import { Mppx } from 'mppx/nextjs';
import { sui, USDC } from '@suimpp/mpp/server';
import type { PaymentReport } from '@suimpp/mpp/server';
import { TREASURY_ADDRESS } from './constants';
import { logPayment } from './log-payment';
import { parseReceiptDigest } from './receipt';
import { getDigestStore } from './upstash-digest-store';
import { env } from '@/lib/env';

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';

type RouteHandler = (request: Request) => Promise<Response> | Response;

// Holds the on-chain PaymentReport emitted by @suimpp/mpp's onPayment callback
// until the request handler joins it with HTTP context for logPayment(). Keyed
// by transaction digest. Entries are deleted after consumption to bound memory.
const pendingReports = new Map<string, PaymentReport>();

function createMppx() {
  return Mppx.create({
    realm: 'mpp.t2000.ai',
    methods: [sui({
      currency: USDC,
      recipient: TREASURY_ADDRESS,
      network: NETWORK,
      store: getDigestStore(),
      onPayment: (report) => {
        pendingReports.set(report.digest, report);
      },
    })],
  });
}

let _mppx: ReturnType<typeof createMppx> | undefined;

function getGateway() {
  if (!_mppx) _mppx = createMppx();
  return _mppx;
}

function inferServiceEndpoint(rawUrl: string): { service: string; endpoint: string } {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return {
      service: parts[0] ?? 'unknown',
      endpoint: '/' + parts.slice(1).join('/'),
    };
  } catch {
    return { service: 'unknown', endpoint: '/' };
  }
}

interface ProxyOptions {
  upstreamMethod?: 'GET' | 'POST';
  bodyToQuery?: boolean;
  validate?: (body: Record<string, unknown>) => string | null;
  mapBody?: (body: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Runs after a successful upstream fetch (`res.ok`) when `content-type`
   * looks like JSON. Used to normalize vendor quirks before returning through
   * MPP (e.g. gpt-image-* base64 → hosted URL).
   */
  transformUpstreamResponse?: (upstreamResponse: Response) => Promise<Response>;
}

/**
 * Shared upstream-fetch helper. Runs the upstream HTTP call, applies any
 * `transformUpstreamResponse` for JSON 2xx responses, and returns the
 * Response that should be forwarded to the client.
 */
async function fetchAndTransformUpstream(
  upstream: string,
  upstreamHeaders: Record<string, string>,
  bodyText: string,
  options: ProxyOptions | undefined,
): Promise<Response> {
  const method = options?.upstreamMethod ?? 'POST';
  let url = upstream;

  if (options?.bodyToQuery && bodyText) {
    let params = JSON.parse(bodyText) as Record<string, string>;
    if (options.mapBody) params = options.mapBody(params) as Record<string, string>;
    const qs = new URLSearchParams(params).toString();
    const sep = upstream.includes('?') ? '&' : '?';
    url = `${upstream}${sep}${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...upstreamHeaders,
    },
    body: method === 'POST' ? (bodyText || undefined) : undefined,
  });

  let outgoing = res;
  if (options?.transformUpstreamResponse && res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try {
        outgoing = await options.transformUpstreamResponse(res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[chargeProxy] transformUpstreamResponse threw:', message);
        outgoing = Response.json(
          {
            error: `Gateway response transform failed: ${message}`,
            upstreamStatus: res.status,
          },
          { status: 502 },
        );
      }
    }
  }

  return new Response(outgoing.body, {
    status: outgoing.status,
    headers: { 'content-type': outgoing.headers.get('content-type') ?? 'application/json' },
  });
}

/**
 * Fixed-price proxy — charges a static amount per request, then proxies
 * to the upstream API and returns the response (with optional transform).
 *
 * The previous SPEC 26 settle-on-success path (probe-then-charge with a
 * fingerprint cache + per-route classifier) was reverted 2026-05-22 in
 * favour of the simpler charge-first path. Routes that need refunds for
 * upstream failures should fail fast at the upstream + return 402; the
 * payment-on-failure window is narrow enough in practice that the
 * dual-path complexity wasn't justified.
 */
export function chargeProxy(
  amount: string,
  upstream: string,
  upstreamHeaders: Record<string, string>,
  options?: ProxyOptions,
): RouteHandler {
  return async (req: Request) => {
    const mppx = getGateway();
    const bodyText = await req.text();

    if (options?.validate) {
      let parsed: Record<string, unknown>;
      try {
        parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const validationError = options.validate(parsed);
      if (validationError) {
        return Response.json({ error: validationError }, { status: 400 });
      }
    }

    const handler: RouteHandler = async () =>
      fetchAndTransformUpstream(upstream, upstreamHeaders, bodyText, options);

    const response = await mppx.charge({ amount })(handler)(
      new Request(req.url, { method: req.method, headers: req.headers })
    );

    if (response.status !== 402) {
      const { service, endpoint } = inferServiceEndpoint(req.url);
      const digest = parseReceiptDigest(response.headers.get('Payment-Receipt'));
      const report = digest ? pendingReports.get(digest) : undefined;
      if (digest) pendingReports.delete(digest);
      logPayment({ service, endpoint, amount, digest, sender: report?.sender }).catch(() => {});
    }

    return response;
  };
}

/**
 * Dynamic-price proxy — price is calculated from the request body.
 * Use for commerce APIs where cost depends on what's being purchased.
 *
 * @param amount - Fixed string OR function that reads the body and returns the price.
 * @param handler - Custom async handler that receives the raw body and returns a Response.
 *                  Responsible for calling the upstream API, retries, auth, etc.
 */
export function chargeCustom(
  amount: string | ((body: string) => string | Promise<string>),
  handler: (body: string) => Promise<Response>,
): RouteHandler {
  return async (req: Request) => {
    const mppx = getGateway();
    const bodyText = await req.text();

    let resolvedAmount: string;
    try {
      resolvedAmount = typeof amount === 'function'
        ? await amount(bodyText)
        : amount;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid request';
      return Response.json({ error: msg }, { status: 400 });
    }

    const wrappedHandler: RouteHandler = async () => handler(bodyText);

    const response = await mppx.charge({ amount: resolvedAmount })(wrappedHandler)(
      new Request(req.url, { method: req.method, headers: req.headers })
    );

    if (response.status !== 402) {
      const { service, endpoint } = inferServiceEndpoint(req.url);
      const digest = parseReceiptDigest(response.headers.get('Payment-Receipt'));
      const report = digest ? pendingReports.get(digest) : undefined;
      if (digest) pendingReports.delete(digest);
      logPayment({ service, endpoint, amount: resolvedAmount, digest, sender: report?.sender }).catch(() => {});
    }

    return response;
  };
}

/**
 * Fetch with automatic retries and exponential backoff.
 * Use for commerce APIs where a failed request after payment is costly.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500 || attempt === retries - 1) {
        return new Response(res.body, {
          status: res.status,
          headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
        });
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === retries - 1) break;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return Response.json(
    { error: 'Upstream service unavailable after retries', detail: lastError },
    { status: 502 },
  );
}
