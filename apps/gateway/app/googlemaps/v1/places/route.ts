import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  `https://maps.googleapis.com/maps/api/place/textsearch/json?key=${process.env.GOOGLE_MAPS_API_KEY}`,
  {},
  { upstreamMethod: 'GET', bodyToQuery: true },
);
