import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.03',
  proxy('https://fal.run/fal-ai/flux/dev', {
    authorization: `Key ${process.env.FAL_KEY}`,
  })
);
