import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://api.together.xyz/v1/embeddings', {
  authorization: `Bearer ${env.TOGETHER_API_KEY}`,
});
