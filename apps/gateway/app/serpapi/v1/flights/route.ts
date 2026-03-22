import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  `https://serpapi.com/search.json?engine=google_flights&api_key=${process.env.SERPAPI_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
