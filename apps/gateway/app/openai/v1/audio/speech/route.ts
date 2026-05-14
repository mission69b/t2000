import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

/**
 * OpenAI TTS API (tts-1 / tts-1-hd) — SPEC 26 P7 settle-on-success.
 *
 * ## Why no custom classifier
 *
 * TTS returns binary audio bytes (mp3 / opus / aac / flac / wav / pcm
 * depending on `response_format`). All-or-nothing at the HTTP layer:
 * 200 with audio body = deliverable, 4xx = invalid voice / model /
 * format. The probe captures the raw audio bytes; the classifier sees
 * a 200 response with non-JSON content-type and the default classifier
 * returns deliverable. The downstream client receives the same bytes.
 *
 * Note on the cache (D-1 60s TTL): TTS audio bodies tend to be larger
 * (~20–200 KB per phrase) than text/JSON, so the Upstash cache value
 * size grows with the audio length. A cache hit on a TTS retry within
 * 60s saves both an OpenAI roundtrip AND another base64 round-trip
 * through Upstash — no D-1 override needed at this scale.
 */
export const POST = chargeProxy(
  '0.02',
  'https://api.openai.com/v1/audio/speech',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  },
  {
    settleOnSuccess: true,
  },
);
