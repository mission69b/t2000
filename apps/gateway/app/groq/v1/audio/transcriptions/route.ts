import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.groq.com/openai/v1/audio/transcriptions', {
  authorization: `Bearer ${process.env.GROQ_API_KEY}`,
});
