import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  `https://api.openweathermap.org/data/2.5/weather?appid=${env.OPENWEATHER_API_KEY}&units=metric`,
  {},
  {
    upstreamMethod: 'GET',
    bodyToQuery: true,
    mapBody: (b) => {
      if (b.city && !b.q) { b.q = b.city; delete b.city; }
      return b;
    },
  },
);
