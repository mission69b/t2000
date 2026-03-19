import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.together.xyz/v1/chat/completions', {
  authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
});
