import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  `https://api.screenshotone.com/take?access_key=${env.SCREENSHOTONE_API_KEY}`,
  { accept: 'image/png' },
  { settleOnSuccess: true, upstreamMethod: 'GET', bodyToQuery: true },
);
