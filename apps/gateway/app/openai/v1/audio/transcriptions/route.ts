import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.01',
  proxy('https://api.openai.com/v1/audio/transcriptions', {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  })
);
