import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.005',
  'https://api-free.deepl.com/v2/translate',
  { authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}` },
  { settleOnSuccess: true },
);
