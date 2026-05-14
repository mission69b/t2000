import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.05', 'https://fal.run/fal-ai/flux-pro', {
  authorization: `Key ${env.FAL_KEY}`,
}, { settleOnSuccess: true });
