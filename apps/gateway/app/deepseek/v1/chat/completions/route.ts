import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://api.deepseek.com/chat/completions', {
  authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
});
