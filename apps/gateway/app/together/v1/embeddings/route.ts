import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.001', 'https://api.together.xyz/v1/embeddings', {
  authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
});
