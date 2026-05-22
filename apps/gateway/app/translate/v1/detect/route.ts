import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  '0.01',
  `https://translation.googleapis.com/language/translate/v2/detect?key=${env.GOOGLE_TRANSLATE_API_KEY}`,
  {},
  {  },
);
