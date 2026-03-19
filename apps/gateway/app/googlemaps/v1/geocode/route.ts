import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  `https://maps.googleapis.com/maps/api/geocode/json?key=${process.env.GOOGLE_MAPS_API_KEY}`,
  {},
  { upstreamMethod: 'GET', bodyToQuery: true },
);
