import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.005',
  `https://translation.googleapis.com/language/translate/v2/detect?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`,
  {},
);
