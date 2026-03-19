import { Mppx } from 'mppx/nextjs';
import { sui } from '@t2000/mpp-sui/server';
import { SUI_USDC_TYPE, TREASURY_ADDRESS } from './constants';

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

interface ProxyOptions {
  upstreamMethod?: 'GET' | 'POST';
  bodyToQuery?: boolean;
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

    const handler: RouteHandler = async () => {
      let url = upstream;

      if (options?.bodyToQuery && bodyText) {
        const params = JSON.parse(bodyText) as Record<string, string>;
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

    return mppx.charge({ amount })(handler)(
      new Request(req.url, { method: req.method, headers: req.headers })
    );
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

    const resolvedAmount = typeof amount === 'function'
      ? await amount(bodyText)
      : amount;

    const wrappedHandler: RouteHandler = async () => handler(bodyText);

    return mppx.charge({ amount: resolvedAmount })(wrappedHandler)(
      new Request(req.url, { method: req.method, headers: req.headers })
    );
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
      if (res.status < 500 || attempt === retries - 1) return res;
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
