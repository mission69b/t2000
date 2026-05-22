import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.05', 'https://api.elevenlabs.io/v1/sound-generation', {
  'xi-api-key': env.ELEVENLABS_API_KEY!,
});
