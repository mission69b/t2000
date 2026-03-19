import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.01', 'https://fal.run/fal-ai/whisper', {
  authorization: `Key ${process.env.FAL_KEY}`,
});
