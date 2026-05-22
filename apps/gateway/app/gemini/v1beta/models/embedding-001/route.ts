import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('0.001', 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', {
  'x-goog-api-key': env.GEMINI_API_KEY!,
});
