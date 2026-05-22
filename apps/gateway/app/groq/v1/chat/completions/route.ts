import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://api.groq.com/openai/v1/chat/completions', {
  authorization: `Bearer ${env.GROQ_API_KEY}`,
});
