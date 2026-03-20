import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  `https://api.hunter.io/v2/email-verifier?api_key=${process.env.HUNTER_API_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
