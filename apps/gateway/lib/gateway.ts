import { Mppx } from 'mppx/nextjs';
import { sui } from '@t2000/mpp-sui/server';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from './constants';
import { logPayment } from './log-payment';
import { parseReceiptDigest } from './receipt';

type RouteHandler = (request: Request) => Promise<Response> | Response;

function createMppx() {
  return Mppx.create({
    methods: [sui({
      currency: SUI_USDC_TYPE,
      recipient: TREASURY_ADDRESS,
      network: (process.env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet',
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
}

/**
 * Fixed-price proxy — charges a static amount per request.
 * Use for standard APIs where every request costs the same.
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
    const method = options?.upstreamMethod ?? 'POST';

    if (options?.validate && bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as Record<string, unknown>;
        const validationError = options.validate(parsed);
        if (validationError) {
          return Response.json({ error: validationError }, { status: 400 });
        }
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    const handler: RouteHandler = async () => {
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
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
      });
    };

    const response = await mppx.charge({ amount })(handler)(
      new Request(req.url, { method: req.method, headers: req.headers })
    );

    if (response.status !== 402) {
      const { service, endpoint } = inferServiceEndpoint(req.url);
      const receipt = response.headers.get('Payment-Receipt');
      logPayment({
        service,
        endpoint,
        amount,
        digest: parseReceiptDigest(receipt),
      }).catch(() => {});
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
      const receipt = response.headers.get('Payment-Receipt');
      logPayment({
        service,
        endpoint,
        amount: resolvedAmount,
        digest: parseReceiptDigest(receipt),
      }).catch(() => {});
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
