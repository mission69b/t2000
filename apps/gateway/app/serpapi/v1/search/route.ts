import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  `https://serpapi.com/search.json?engine=google&api_key=${env.SERPAPI_API_KEY}`,
  { accept: 'application/json' },
  { settleOnSuccess: true, upstreamMethod: 'GET', bodyToQuery: true },
);
