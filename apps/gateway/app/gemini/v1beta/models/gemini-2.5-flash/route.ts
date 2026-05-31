import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

export const POST = chargeProxy('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  'x-goog-api-key': env.GEMINI_API_KEY!,
});
