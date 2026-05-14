import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.005',
  'https://newsapi.org/v2/everything',
  { 'x-api-key': env.NEWSAPI_API_KEY! },
  { settleOnSuccess: true, upstreamMethod: 'GET', bodyToQuery: true },
);
