import { chargeProxy } from '@/lib/gateway';

export const POST = chargeProxy('0.02', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent', {
  'x-goog-api-key': process.env.GEMINI_API_KEY!,
});
