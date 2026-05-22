import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.001',
  'https://api.openai.com/v1/embeddings',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  }
);
