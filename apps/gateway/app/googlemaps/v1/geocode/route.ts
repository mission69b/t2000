import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  `https://maps.googleapis.com/maps/api/geocode/json?key=${env.GOOGLE_MAPS_API_KEY}`,
  {},
  { upstreamMethod: 'GET', bodyToQuery: true },
);
