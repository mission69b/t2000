import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  'https://judge0-ce.p.rapidapi.com/languages',
  {
    'x-rapidapi-key': env.RAPIDAPI_KEY!,
    'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
  },
  { upstreamMethod: 'GET' },
);
