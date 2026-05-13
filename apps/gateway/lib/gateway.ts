import { Mppx } from 'mppx/nextjs';
import { sui } from '@suimpp/mpp/server';
import type { PaymentReport } from '@suimpp/mpp/server';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from './constants';
import { logPayment } from './log-payment';
import { parseReceiptDigest } from './receipt';
import { getDigestStore } from './upstash-digest-store';
import { chargeProxyFingerprint } from './charge-proxy-fingerprint';
import {
  InMemoryUpstreamResponseCache,
  type UpstreamResponseCache,
} from './upstream-response-cache';
import { getUpstashUpstreamResponseCache } from './upstash-upstream-response-cache';

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
const SERVER_URL = 'https://mpp.t2000.ai';
const REGISTRY_URL = 'https://suimpp.dev/api/report';

type RouteHandler = (request: Request) => Promise<Response> | Response;

const pendingReports = new Map<string, PaymentReport>();

function createMppx() {
  return Mppx.create({
    realm: 'mpp.t2000.ai',
    methods: [sui({
      currency: SUI_USDC_TYPE,
      recipient: TREASURY_ADDRESS,
      network: NETWORK,
      store: getDigestStore(),
      onPayment: (report) => {
        pendingReports.set(report.digest, report);
      },
    })],
  });
}

function reportToRegistry(
  report: PaymentReport,
  context: { service: string; endpoint: string },
) {
  pendingReports.delete(report.digest);
  fetch(REGISTRY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...report,
      serverUrl: SERVER_URL,
      service: context.service,
      endpoint: `/${context.service}${context.endpoint}`,
    }),
  }).catch(() => {});
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

/**
 * SPEC 26 — verdict returned by the per-route response classifier when
 * `settleOnSuccess: true`. Drives the charge gate:
 *
 *   - `'deliverable'` → upstream succeeded; charge fires for full `amount`.
 *   - `'refundable'`  → upstream failed in a user-actionable way; NO
 *                       charge, response forwarded to client with HTTP 402.
 *   - `'mixed'`       → partial success (e.g. OpenAI n=4 with 3 successes).
 *                       Charge fires for `amount * chargedFraction`.
 */
export type ClassifyVerdict =
  | { kind: 'deliverable'; price?: string }
  | { kind: 'refundable'; reason: string }
  | { kind: 'mixed'; chargedFraction: number; reason: string };

/**
 * Default classifier used when `settleOnSuccess: true` is set without an
 * explicit `classifyResponse`. Maps the upstream HTTP status onto the
 * verdict: 2xx → deliverable, anything else → refundable. Per-route
 * classifiers (e.g. OpenAI partial-success in P3) can override.
 */
export const DEFAULT_CLASSIFY_RESPONSE: NonNullable<ProxyOptions['classifyResponse']> = async (
  res,
) => {
  if (res.ok) return { kind: 'deliverable' };
  return { kind: 'refundable', reason: `upstream ${res.status}` };
};

/**
 * SPEC 26 D-1 lock — upstream-response cache TTL when `settleOnSuccess: true`.
 * Long enough to cover Sui finality (typical 2–5s), short enough to bound
 * any replay window. Override per-handler via `ProxyOptions.cacheTtlSeconds`
 * (e.g. raise to 300 if Sui p99 latency trends > 30s — see spec §5.6).
 */
export const SETTLE_CACHE_TTL_SECONDS = 60;

/**
 * SPEC 26 D-3 lock — hard limit on absorbed vendor cost when an upstream
 * probe succeeds but the subsequent charge fails (chain congestion, client
 * disconnect, etc.). Routes priced above this limit MUST be opted into
 * `settleOnSuccess` only after a per-route D-question.
 *
 * Today's max route is $1 (Lob postcard); 5x headroom covers any
 * medium-cost service we'd add this year. Datadog `mpp.settle.absorbed_cost_usd`
 * (D-9) tracks weekly absorbed cost; promote to a weekly cap if the gauge
 * trends bad.
 */
export const SETTLE_MAX_ABSORBED_COST_USD = 5;

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

  /**
   * SPEC 26 — when `true`, fetch upstream FIRST and charge only after the
   * response is classified as deliverable (or partially deliverable). This
   * eliminates the `bug_mpp_no_refund_on_failure` window for synchronous
   * vendor failures at the cost of ~200–500ms latency per call (one
   * upstream RTT before the charge round-trip).
   *
   * Default: `false` (legacy charge-first behavior — byte-identical to
   * pre-SPEC-26 code path). Per-route opt-in per D-4 lock.
   */
  settleOnSuccess?: boolean;

  /**
   * SPEC 26 — used only when `settleOnSuccess: true`. Classifies the
   * upstream response into one of three verdicts (deliverable / refundable
   * / mixed). Defaults to `DEFAULT_CLASSIFY_RESPONSE` (`res.ok ? deliverable
   * : refundable`) when omitted. Per-route classifiers handle vendor-specific
   * partial-success shapes (e.g. OpenAI's `data[].error` in n>1 image gen).
   */
  classifyResponse?: (
    res: Response,
    body: unknown,
  ) => Promise<ClassifyVerdict>;

  /**
   * SPEC 26 — proxy identifier used as the multi-tenant fingerprint
   * suffix when `settleOnSuccess: true`. Defaults to the literal
   * `'default'` so single-tenant deployments work out of the box. Set
   * per-route in multi-tenant deployments so caller A's identical body
   * doesn't collide with caller B's cache slot.
   */
  apiKeyId?: string;

  /**
   * SPEC 26 — override the cache TTL for this route (default
   * `SETTLE_CACHE_TTL_SECONDS = 60`). Increase if Sui p99 latency trends
   * > 30s (see spec §5.6). Has no effect when `settleOnSuccess: false`.
   */
  cacheTtlSeconds?: number;
}

/**
 * Process-wide cache instance for `settleOnSuccess` mode (SPEC 26).
 *
 * **Resolution order (first match wins):**
 *   1. Whatever was last passed to `setUpstreamResponseCache(...)` — the
 *      test override / explicit injection seam (always wins).
 *   2. `UpstashUpstreamResponseCache` — when both `KV_REST_API_URL` and
 *      `KV_REST_API_TOKEN` are present in env (multi-instance correct;
 *      mandatory for Vercel where ≥2 functions per route share traffic).
 *   3. `InMemoryUpstreamResponseCache` — local dev / unit tests / any
 *      env without KV vars wired. NOT safe for multi-instance prod.
 *
 * Initialization is lazy (first `getUpstreamResponseCache()` call) so
 * importing `gateway.ts` doesn't trigger Upstash client construction
 * (and the implicit env-var read) at module load time. This matches
 * the `getDigestStore()` lazy pattern for `UpstashDigestStore`.
 */
let _upstreamResponseCache: UpstreamResponseCache | undefined;

export function setUpstreamResponseCache(cache: UpstreamResponseCache): void {
  _upstreamResponseCache = cache;
}

export function getUpstreamResponseCache(): UpstreamResponseCache {
  if (!_upstreamResponseCache) {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      _upstreamResponseCache = getUpstashUpstreamResponseCache();
    } else {
      _upstreamResponseCache = new InMemoryUpstreamResponseCache();
    }
  }
  return _upstreamResponseCache;
}

/**
 * Shared upstream-fetch helper used by both the legacy charge-first path
 * AND the SPEC 26 settle-on-success path. Pulled out of the legacy
 * inline closure so both paths transform vendor responses identically
 * (transform errors surface the same way; non-JSON responses bypass the
 * transformer; etc.).
 *
 * Returns the Response that should be forwarded to the client (or, in
 * settle-on-success mode, classified before the charge fires).
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
      // Wrap so a normalizer crash (e.g. Vercel Blob upload throws) doesn't
      // bubble as an unhandled rejection — that path returns an opaque 500
      // with no body, which audric's `useAgent` then renders as the literal
      // string "[object Object]". Surfacing the actual error here lets the
      // host show the user something actionable.
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
 * Fixed-price proxy — charges a static amount per request.
 * Use for standard APIs where every request costs the same.
 *
 * ## Behavior modes (SPEC 26)
 *
 * **Default (`settleOnSuccess: false` or omitted)** — LEGACY path,
 * byte-identical to pre-SPEC-26. Charges Sui USDC FIRST via
 * `mppx.charge`, then runs the upstream fetch + transform. If upstream
 * fails post-charge, the user is out the money (the
 * `bug_mpp_no_refund_on_failure` class).
 *
 * **`settleOnSuccess: true`** — SPEC 26 mode. Probes upstream FIRST,
 * classifies the response, then charges only on a deliverable verdict.
 * Refundable verdicts return HTTP 402 with no charge. Mixed verdicts
 * charge a fractional amount. See spec § 2.2 for the full flow.
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

    if (options?.settleOnSuccess) {
      return chargeProxySettleOnSuccess({
        mppx,
        amount,
        upstream,
        upstreamHeaders,
        options,
        req,
        bodyText,
      });
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
      logPayment({ service, endpoint, amount, digest, sender: report?.sender }).catch(() => {});
      if (report) reportToRegistry(report, { service, endpoint });
    }

    return response;
  };
}

/**
 * SPEC 26 settle-on-success implementation. Lives outside `chargeProxy`
 * so the legacy path stays visually identical to its pre-SPEC-26 shape
 * (regression bar from spec §6.4: the legacy branch is byte-equivalent
 * to today's behavior).
 *
 * Flow:
 *   1. Compute fingerprint over (method + path + sortedJsonBody + apiKeyId)
 *   2. Cache hit within TTL → return cached body + cached Payment-Receipt
 *      (no second charge, no second probe — true idempotency per §5.2/5.3)
 *   3. Cache miss → probe upstream + transform
 *   4. Classify response (default: res.ok → deliverable, else refundable)
 *   5. Refundable → return HTTP 402 with the upstream error body, no charge
 *   6. Deliverable / mixed → charge for `amount * chargedFraction`
 *      a. If charge fails (chain congestion, replay, etc.) → return 402,
 *         absorb upstream cost (within `SETTLE_MAX_ABSORBED_COST_USD`)
 *      b. If charge succeeds → return upstream body with Payment-Receipt
 *         header, populate cache for the TTL window
 */
async function chargeProxySettleOnSuccess(params: {
  mppx: ReturnType<typeof createMppx>;
  amount: string;
  upstream: string;
  upstreamHeaders: Record<string, string>;
  options: ProxyOptions;
  req: Request;
  bodyText: string;
}): Promise<Response> {
  const { mppx, amount, upstream, upstreamHeaders, options, req, bodyText } = params;
  const cache = getUpstreamResponseCache();
  const ttlSeconds = options.cacheTtlSeconds ?? SETTLE_CACHE_TTL_SECONDS;
  const apiKeyId = options.apiKeyId ?? 'default';

  // Phase 1 — fingerprint + cache lookup
  const url = (() => {
    try {
      return new URL(req.url);
    } catch {
      return null;
    }
  })();
  const path = url?.pathname ?? req.url;
  const fingerprint = chargeProxyFingerprint({
    method: req.method,
    path,
    body: bodyText,
    apiKeyId,
  });

  const cached = await cache.get(fingerprint);
  if (cached) {
    // Idempotent retry — return cached body + cached receipt. NO charge,
    // NO probe. Per §5.2 + §5.3 this is the legitimate-retry path.
    const headers = new Headers({ 'content-type': cached.contentType });
    if (cached.paymentReceiptHeader) {
      headers.set('Payment-Receipt', cached.paymentReceiptHeader);
    }
    return new Response(cached.body, { status: cached.status, headers });
  }

  // Phase 2 — probe upstream
  const probeRes = await fetchAndTransformUpstream(upstream, upstreamHeaders, bodyText, options);
  // Read the body bytes ONCE so we can both classify and re-emit. Type
  // is `ArrayBuffer` (not `Uint8Array`) because that's the unambiguous
  // `BodyInit` shape under Node 22+ DOM types — see CachedUpstreamResponse.
  const probeBytes = await probeRes.arrayBuffer();
  const probeContentType = probeRes.headers.get('content-type') ?? 'application/json';

  // Reconstruct a fresh Response for the classifier (the original was
  // consumed by arrayBuffer above). Body parsing happens here once so
  // the classifier has the parsed shape without re-decoding bytes.
  let parsedBody: unknown = undefined;
  if (probeContentType.includes('application/json')) {
    try {
      parsedBody = JSON.parse(new TextDecoder().decode(probeBytes));
    } catch {
      parsedBody = undefined;
    }
  }
  const probeForClassifier = new Response(probeBytes, {
    status: probeRes.status,
    headers: { 'content-type': probeContentType },
  });

  // Phase 3 — classify
  const classifier = options.classifyResponse ?? DEFAULT_CLASSIFY_RESPONSE;
  const verdict = await classifier(probeForClassifier, parsedBody);

  if (verdict.kind === 'refundable') {
    // No charge. Return the upstream error body verbatim, but coerce the
    // status to 402 so the client (audric) gets the explicit
    // "no-charge-can-retry" signal per spec §2.3 + D-8.
    return new Response(probeBytes, {
      status: 402,
      headers: {
        'content-type': probeContentType,
        'X-Settle-Verdict': 'refundable',
        'X-Settle-Reason': verdict.reason.slice(0, 256),
      },
    });
  }

  // Phase 4 — charge
  const chargedFraction = verdict.kind === 'mixed' ? verdict.chargedFraction : 1;
  const chargeAmount = computeChargeAmount(amount, chargedFraction);

  // Stub handler — mppx still needs a handler to run, but we've already
  // probed upstream and don't want to re-fire the request. The stub
  // returns the captured body so mppx wraps it with the Payment-Receipt
  // header without a second upstream RTT.
  const stubHandler: RouteHandler = async () =>
    new Response(probeBytes, {
      status: probeRes.status,
      headers: { 'content-type': probeContentType },
    });

  let chargeResponse: Response;
  try {
    chargeResponse = await mppx.charge({ amount: chargeAmount })(stubHandler)(
      new Request(req.url, { method: req.method, headers: req.headers }),
    );
  } catch (chargeErr) {
    // Chain congestion / replay rejection / disconnect mid-charge.
    // We've already paid the upstream vendor cost; absorb it. Return
    // 402 so the client knows the request is safe to retry. Track on
    // Datadog `mpp.settle.charge_failed_after_probe` (D-9) when wired.
    const message = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
    console.error('[chargeProxy:settleOnSuccess] charge failed after successful probe:', message);
    return new Response(probeBytes, {
      status: 402,
      headers: {
        'content-type': probeContentType,
        'X-Settle-Verdict': 'charge-failed',
        'X-Settle-Reason': message.slice(0, 256),
      },
    });
  }

  if (chargeResponse.status === 402) {
    // mppx returned 402 — auth header missing/invalid. Pass through
    // unchanged (no charge happened, no upstream cost absorbed because
    // we already paid it; mppx won't double-bill).
    return chargeResponse;
  }

  // Phase 5 — deliver. Charge succeeded; merge Payment-Receipt onto our
  // captured probe body + populate cache for the TTL window so legitimate
  // retries return the same digest (§5.2 idempotency).
  const paymentReceiptHeader = chargeResponse.headers.get('Payment-Receipt');
  const finalHeaders = new Headers({ 'content-type': probeContentType });
  if (paymentReceiptHeader) {
    finalHeaders.set('Payment-Receipt', paymentReceiptHeader);
  }

  await cache.set(
    fingerprint,
    {
      status: probeRes.status,
      body: probeBytes,
      contentType: probeContentType,
      paymentReceiptHeader,
    },
    ttlSeconds,
  );

  // Logging + registry report — same as legacy path.
  const { service, endpoint } = inferServiceEndpoint(req.url);
  const digest = parseReceiptDigest(paymentReceiptHeader);
  const report = digest ? pendingReports.get(digest) : undefined;
  logPayment({ service, endpoint, amount: chargeAmount, digest, sender: report?.sender }).catch(
    () => {},
  );
  if (report) reportToRegistry(report, { service, endpoint });

  return new Response(probeBytes, {
    status: probeRes.status,
    headers: finalHeaders,
  });
}

/**
 * Computes the charged amount for a verdict.kind === 'mixed' result.
 * Sui USDC has 6 decimals so `$0.05 × 0.75 = $0.0375 = 37500 raw units`
 * (no precision loss — see spec §5.8).
 *
 * Floors to 6 decimals to match `financial-amounts.mdc` rule "never round
 * up" — a fractional charge MUST be ≤ the on-chain amount, never more.
 */
export function computeChargeAmount(amount: string, fraction: number): string {
  if (fraction >= 1) return amount;
  if (fraction <= 0) return '0';
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return amount;
  // 6 decimals = USDC native precision. Floor (not round) per
  // financial-amounts.mdc; rounding up could exceed the deliverable
  // value when measured against the base amount.
  const scaled = Math.floor(numeric * fraction * 1_000_000) / 1_000_000;
  return scaled.toFixed(6);
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
      logPayment({ service, endpoint, amount: resolvedAmount, digest, sender: report?.sender }).catch(() => {});
      if (report) reportToRegistry(report, { service, endpoint });
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
