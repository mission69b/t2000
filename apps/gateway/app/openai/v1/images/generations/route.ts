import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.05',
  proxy('https://api.openai.com/v1/images/generations', {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  })
);
