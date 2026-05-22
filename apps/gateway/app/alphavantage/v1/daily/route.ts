import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.005',
  `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&apikey=${env.ALPHAVANTAGE_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
