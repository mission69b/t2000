import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.03', 'https://fal.run/fal-ai/recraft-20b', {
  authorization: `Key ${env.FAL_KEY}`,
}, { settleOnSuccess: true });
