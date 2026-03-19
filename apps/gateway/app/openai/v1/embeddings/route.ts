import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.001', 'https://api.openai.com/v1/embeddings', {
  authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
});
