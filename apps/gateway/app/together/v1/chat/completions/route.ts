import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://api.together.xyz/v1/chat/completions', {
  authorization: `Bearer ${env.TOGETHER_API_KEY}`,
});
