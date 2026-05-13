/**
 * Pre-charge validation for the `openai/v1/images/generations` MPP route.
 *
 * Lives in its OWN file (not `route.ts`) because Next.js 15 route modules
 * may only export the canonical Route exports (`GET`, `POST`, etc. — see
 * t2000 HANDOFF Lesson 1.0). Sibling files are unconstrained and freely
 * importable from both the route handler and the test.
 *
 * What this validates BEFORE any Sui USDC transfer fires:
 *   1. `BLOB_READ_WRITE_TOKEN` is set (gpt-image-* responses are b64-only;
 *      the gateway uploads to Vercel Blob before returning a hosted URL).
 *   2. `model` (if present) is in the current allow-list.
 *   3. `size` (if present) is in the current allow-list — closes the
 *      2026-05-13 P7 smoke retry failure ($0.05 charged for "256x256",
 *      a deprecated DALL-E 2 value that gpt-image-* rejects post-charge).
 *   4. `quality` (if present) is in the current allow-list — closes the
 *      2026-05-13 + 2026-05-14 smokes where the LLM emitted `quality=standard`
 *      (a deprecated DALL-E 3 value gpt-image-* rejects). Pre-validate
 *      avoids ~38s of OpenAI probe RTT + the gateway-absorbed ~$0.05
 *      vendor cost per malformed quality value.
 *
 * Each gate returns a string (error message) on failure or `null` on pass.
 * The return type matches `chargeProxy`'s `validate` hook contract — any
 * non-null return short-circuits to a 400 BEFORE `mppx.charge` fires.
 */

export const VALID_MODELS = new Set(['gpt-image-1', 'gpt-image-1-mini']);

export const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);

export const VALID_QUALITIES = new Set(['low', 'medium', 'high', 'auto']);

export interface ValidationEnv {
  blobToken: string | undefined;
}

export function validateImagesGenerationsBody(
  body: Record<string, unknown>,
  env: ValidationEnv,
): string | null {
  if (!env.blobToken) {
    return (
      'Gateway misconfigured: BLOB_READ_WRITE_TOKEN is required for OpenAI image generations. ' +
      'gpt-image-* models return base64-only responses; the gateway uploads them to Blob before returning URLs.'
    );
  }

  const model = body.model;
  if (model !== undefined && model !== null && model !== '') {
    if (typeof model !== 'string') {
      return `Model must be a string. Got: ${typeof model}`;
    }
    if (!VALID_MODELS.has(model)) {
      return `Model "${model}" is not currently supported. Valid models: ${[...VALID_MODELS].join(', ')}. Note: dall-e-3 and dall-e-2 were shut down 2026-05-12.`;
    }
  }

  const size = body.size;
  if (size !== undefined && size !== null && size !== '') {
    if (typeof size !== 'string') {
      return `Size must be a string. Got: ${typeof size}`;
    }
    if (!VALID_SIZES.has(size)) {
      return `Size "${size}" is not currently supported. Valid sizes: ${[...VALID_SIZES].join(', ')}. Note: 256x256 and 512x512 are DALL-E 2 legacy values rejected by gpt-image-*.`;
    }
  }

  const quality = body.quality;
  if (quality !== undefined && quality !== null && quality !== '') {
    if (typeof quality !== 'string') {
      return `Quality must be a string. Got: ${typeof quality}`;
    }
    if (!VALID_QUALITIES.has(quality)) {
      return `Quality "${quality}" is not currently supported. Valid qualities: ${[...VALID_QUALITIES].join(', ')}. Note: "standard" / "hd" were DALL-E 3 values rejected by gpt-image-*.`;
    }
  }

  return null;
}
