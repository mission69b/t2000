import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  `https://phonevalidation.abstractapi.com/v1/?api_key=${process.env.ABSTRACTAPI_PHONE_KEY}`,
  { accept: 'application/json' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
