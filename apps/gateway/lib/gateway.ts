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

export function charge(amount: string, handler: RouteHandler): RouteHandler {
  return (req: Request) => {
    const mppx = getGateway();
    return mppx.charge({ amount })(handler)(req);
  };
}

export function proxy(upstream: string, headers: Record<string, string>): RouteHandler {
  return async (req: Request) => {
    const res = await fetch(upstream, {
      method: req.method,
      headers: {
        'content-type': req.headers.get('content-type') ?? 'application/json',
        ...headers,
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    });

    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  };
}
