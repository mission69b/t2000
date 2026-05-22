import { chargeProxy } from '@/lib/gateway';
import { validateFlights } from '@/lib/validators';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  `https://serpapi.com/search.json?engine=google_flights&api_key=${env.SERPAPI_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true, validate: validateFlights },
);
