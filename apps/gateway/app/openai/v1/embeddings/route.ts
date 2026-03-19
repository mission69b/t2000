import { charge, proxy } from '@/lib/gateway';

export const POST = charge('0.001',
  proxy('https://api.openai.com/v1/embeddings', {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  })
);
