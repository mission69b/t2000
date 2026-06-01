import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://fal.run/fal-ai/stable-audio-25/text-to-audio', {
  authorization: `Key ${env.FAL_KEY}`,
});
