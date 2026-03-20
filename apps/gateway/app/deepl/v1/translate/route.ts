import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  'https://api-free.deepl.com/v2/translate',
  { authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}` },
);
