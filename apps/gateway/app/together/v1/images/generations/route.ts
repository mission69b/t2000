import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.03', 'https://api.together.xyz/v1/images/generations', {
  authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
});
