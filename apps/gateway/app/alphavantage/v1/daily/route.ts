import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&apikey=${process.env.ALPHAVANTAGE_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
