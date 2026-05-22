import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.03', 'https://api.together.xyz/v1/images/generations', {
  authorization: `Bearer ${env.TOGETHER_API_KEY}`,
});
