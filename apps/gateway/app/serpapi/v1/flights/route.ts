import { chargeProxy } from '@/lib/gateway';
import { validateFlights } from '@/lib/validators';

export const POST = chargeProxy(
  '0.01',
  `https://serpapi.com/search.json?engine=google_flights&api_key=${process.env.SERPAPI_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true, validate: validateFlights },
);
