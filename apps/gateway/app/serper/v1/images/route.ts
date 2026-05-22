import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  'https://google.serper.dev/images',
  { 'x-api-key': env.SERPER_API_KEY! },
  {  },
);
