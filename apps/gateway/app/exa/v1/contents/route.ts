import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  'https://api.exa.ai/contents',
  { 'x-api-key': env.EXA_API_KEY! },
  { settleOnSuccess: true },
);
