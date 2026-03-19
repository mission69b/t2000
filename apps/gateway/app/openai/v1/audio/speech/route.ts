import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.02', 'https://api.openai.com/v1/audio/speech', {
  authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
});
