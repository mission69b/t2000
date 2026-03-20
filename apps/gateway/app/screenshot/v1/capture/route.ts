import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  `https://api.screenshotone.com/take?access_key=${process.env.SCREENSHOTONE_API_KEY}`,
  { accept: 'image/png' },
  { upstreamMethod: 'GET', bodyToQuery: true },
);
