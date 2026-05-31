import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://api.perplexity.ai/chat/completions', {
  authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
});
