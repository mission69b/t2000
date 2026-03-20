import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  'https://api.printful.com/orders/estimate',
  { authorization: `Bearer ${process.env.PRINTFUL_API_KEY}` },
);
