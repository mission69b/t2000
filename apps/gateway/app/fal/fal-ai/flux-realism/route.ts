import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.03', 'https://fal.run/fal-ai/flux-realism', {
  authorization: `Key ${process.env.FAL_KEY}`,
});
