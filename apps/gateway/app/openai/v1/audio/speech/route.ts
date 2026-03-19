import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.02',
  proxy('https://api.openai.com/v1/audio/speech', {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  })
);
