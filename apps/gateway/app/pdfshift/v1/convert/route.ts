import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy(
  'https://api.pdfshift.io/v3/convert/pdf',
  { 'x-api-key': env.PDFSHIFT_API_KEY! },
  {  },
);
