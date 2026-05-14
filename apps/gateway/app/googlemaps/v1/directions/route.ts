import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  `https://maps.googleapis.com/maps/api/directions/json?key=${env.GOOGLE_MAPS_API_KEY}`,
  {},
  { settleOnSuccess: true, upstreamMethod: 'GET', bodyToQuery: true },
);
