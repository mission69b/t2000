import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.cohere.com/v2/rerank', {
  authorization: `Bearer ${process.env.COHERE_API_KEY}`,
});
