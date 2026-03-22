import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://api.mistral.ai/v1/embeddings', {
  authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
});
