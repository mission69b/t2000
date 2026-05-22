import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://api.mistral.ai/v1/embeddings', {
  authorization: `Bearer ${env.MISTRAL_API_KEY}`,
});
