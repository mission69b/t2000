import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  'https://newsapi.org/v2/everything',
  { 'x-api-key': process.env.NEWSAPI_API_KEY! },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
