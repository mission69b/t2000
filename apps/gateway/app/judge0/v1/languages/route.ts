import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.001',
  'https://judge0-ce.p.rapidapi.com/languages',
  {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
    'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
  },
  { upstreamMethod: 'GET' },
);
