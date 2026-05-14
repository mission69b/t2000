import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.005', 'https://api.deepseek.com/chat/completions', {
  authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
}, { settleOnSuccess: true });
