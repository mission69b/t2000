import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://api.groq.com/openai/v1/chat/completions', {
  authorization: `Bearer ${env.GROQ_API_KEY}`,
});
