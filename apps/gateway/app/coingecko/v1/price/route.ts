import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.005',
  `https://api.coingecko.com/api/v3/simple/price?x_cg_demo_api_key=${env.COINGECKO_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
