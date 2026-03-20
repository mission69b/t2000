import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  'https://api.printful.com/store/products',
  { authorization: `Bearer ${process.env.PRINTFUL_API_KEY}` },
  { upstreamMethod: 'GET' },
);
