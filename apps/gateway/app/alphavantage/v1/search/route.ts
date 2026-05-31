import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&apikey=${env.ALPHAVANTAGE_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
