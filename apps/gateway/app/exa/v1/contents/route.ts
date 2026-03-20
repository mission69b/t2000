import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  'https://api.exa.ai/contents',
  { 'x-api-key': process.env.EXA_API_KEY! },
);
