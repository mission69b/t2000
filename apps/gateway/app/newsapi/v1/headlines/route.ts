import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.005',
  'https://newsapi.org/v2/top-headlines',
  { 'x-api-key': env.NEWSAPI_API_KEY! },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
