import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.005', 'https://api.groq.com/openai/v1/audio/transcriptions', {
  authorization: `Bearer ${env.GROQ_API_KEY}`,
});
