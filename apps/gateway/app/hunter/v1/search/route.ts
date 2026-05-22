import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.02',
  `https://api.hunter.io/v2/domain-search?api_key=${env.HUNTER_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
