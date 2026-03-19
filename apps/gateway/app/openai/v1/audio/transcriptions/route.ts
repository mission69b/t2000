import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.01', 'https://api.openai.com/v1/audio/transcriptions', {
  authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
});
