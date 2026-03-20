import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  'https://api.exa.ai/search',
  { 'x-api-key': process.env.EXA_API_KEY! },
);
