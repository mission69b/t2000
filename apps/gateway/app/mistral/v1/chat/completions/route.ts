import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.005', 'https://api.mistral.ai/v1/chat/completions', {
  authorization: `Bearer ${env.MISTRAL_API_KEY}`,
}, { settleOnSuccess: true });
