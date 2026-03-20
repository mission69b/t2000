import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  'https://google.serper.dev/search',
  { 'x-api-key': process.env.SERPER_API_KEY! },
);
