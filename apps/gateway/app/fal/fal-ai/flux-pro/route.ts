import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.05',
  proxy('https://fal.run/fal-ai/flux-pro', {
    authorization: `Key ${process.env.FAL_KEY}`,
  })
);
