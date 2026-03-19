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
        url = `${upstream}?${qs}`;
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
