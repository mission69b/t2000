import { chargeProxy } from '@/lib/gateway';
import { env } from '@/lib/env';

/**
 * OpenAI Embeddings API (text-embedding-* models) — SPEC 26 P7 settle-on-success.
 *
 * ## Why no custom classifier
 *
 * Embeddings accept either a single string or an array of strings as
 * `input`. Per OpenAI's contract, the entire request is validated +
 * embedded as a unit: any invalid input fails the WHOLE request with
 * a 400. There is no `data: [{ embedding }, { error }]` partial-success
 * shape — the response is always either a fully-populated `data` array
 * matching the input length or an HTTP error. Default classifier
 * (`res.ok ? deliverable : refundable`) is correct.
 */
export const POST = chargeProxy(
  '0.001',
  'https://api.openai.com/v1/embeddings',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  },
  {
    settleOnSuccess: true,
  },
);
