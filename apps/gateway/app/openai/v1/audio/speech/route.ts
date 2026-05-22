import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.02',
  'https://api.openai.com/v1/audio/speech',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  }
);
