import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.03', 'https://fal.run/fal-ai/flux/dev', {
  authorization: `Key ${process.env.FAL_KEY}`,
});
