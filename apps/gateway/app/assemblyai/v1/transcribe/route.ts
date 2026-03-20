import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.02',
  'https://api.assemblyai.com/v2/transcript',
  { authorization: process.env.ASSEMBLYAI_API_KEY! },
);
