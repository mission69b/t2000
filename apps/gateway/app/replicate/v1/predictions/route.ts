import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.02',
  'https://api.replicate.com/v1/predictions',
  {
    authorization: `Bearer ${process.env.REPLICATE_API_KEY}`,
    prefer: 'wait',
  },
);
