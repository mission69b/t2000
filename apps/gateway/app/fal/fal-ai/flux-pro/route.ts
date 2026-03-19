import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.05', 'https://fal.run/fal-ai/flux-pro', {
  authorization: `Key ${process.env.FAL_KEY}`,
});
