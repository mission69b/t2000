import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  `https://api.openweathermap.org/data/2.5/weather?appid=${process.env.OPENWEATHER_API_KEY}&units=metric`,
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
