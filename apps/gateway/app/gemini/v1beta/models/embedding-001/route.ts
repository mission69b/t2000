import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.001', 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', {
  'x-goog-api-key': process.env.GEMINI_API_KEY!,
});
