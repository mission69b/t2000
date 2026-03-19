import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.01', 'https://api.perplexity.ai/chat/completions', {
  authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
});
