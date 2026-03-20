import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  `https://emailvalidation.abstractapi.com/v1/?api_key=${process.env.ABSTRACTAPI_EMAIL_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
