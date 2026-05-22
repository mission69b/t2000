import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  'https://api.openai.com/v1/chat/completions',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  }
);
