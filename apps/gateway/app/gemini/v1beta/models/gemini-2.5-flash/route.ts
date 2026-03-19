import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.005', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  'x-goog-api-key': process.env.GEMINI_API_KEY!,
});
