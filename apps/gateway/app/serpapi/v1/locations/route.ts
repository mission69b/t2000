import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.005',
  `https://serpapi.com/locations.json?api_key=${env.SERPAPI_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
