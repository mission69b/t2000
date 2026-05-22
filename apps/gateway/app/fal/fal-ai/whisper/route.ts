import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://fal.run/fal-ai/whisper', {
  authorization: `Key ${env.FAL_KEY}`,
});
