import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  'https://api.replicate.com/v1/predictions',
  {
    authorization: `Bearer ${env.REPLICATE_API_KEY}`,
    prefer: 'wait',
  },
  {  },
);
