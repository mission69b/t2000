import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.03', 'https://api.elevenlabs.io/v1/sound-generation', {
  'xi-api-key': process.env.ELEVENLABS_API_KEY!,
});
