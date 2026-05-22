import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.01', 'https://api.cohere.com/v2/rerank', {
  authorization: `Bearer ${env.COHERE_API_KEY}`,
});
