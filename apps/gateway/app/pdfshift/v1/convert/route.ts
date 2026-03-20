import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy(
  '0.01',
  'https://api.pdfshift.io/v3/convert/pdf',
  { 'x-api-key': process.env.PDFSHIFT_API_KEY! },
);
