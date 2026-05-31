import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://api.cohere.com/v2/embed', {
  authorization: `Bearer ${env.COHERE_API_KEY}`,
});
