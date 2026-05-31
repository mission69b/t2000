import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  'https://api.exa.ai/search',
  { 'x-api-key': env.EXA_API_KEY! },
  {  },
);
