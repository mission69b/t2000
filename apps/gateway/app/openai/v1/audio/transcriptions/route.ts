import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

/**
 * OpenAI Audio Transcriptions API (whisper-* models) — SPEC 26 P7
 * settle-on-success.
 *
 * ## Why no custom classifier
 *
 * Whisper returns the transcript in a single envelope (`text` for the
 * default response_format, JSON for `verbose_json`). All-or-nothing at
 * the HTTP layer: 200 = transcript present, 4xx = invalid input / format
 * / language, 5xx = server error. No batch / partial-success shape.
 * Default classifier (`res.ok ? deliverable : refundable`) is correct.
 */
export const POST = chargeProxy(
  '0.01',
  'https://api.openai.com/v1/audio/transcriptions',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  },
  {
    settleOnSuccess: true,
  },
);
