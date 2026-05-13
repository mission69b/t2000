import { chargeProxy } from '@/lib/gateway';
import { transformOpenAiImageGenerationsResponse } from '@/lib/openai-image-blob-normalize';
import { validateImagesGenerationsBody } from './validate';

/**
 * MPP gateway entrypoint for OpenAI image generations.
 *
 * Charges $0.05 per request and proxies to OpenAI. Pre-charge validation
 * (model allow-list, size allow-list, BLOB token check) lives in
 * `./validate.ts` — see that file for the rationale on why each gate
 * exists and how to extend the allow-lists. The validate hook runs BEFORE
 * `mppx.charge()` so a bad parameter is rejected with a 400 + zero spend
 * (closes the `bug_mpp_no_refund_on_failure` window for known-bad inputs).
 *
 * The structural "charge before delivery" gap is being addressed in
 * SPEC 26 — MPP_SETTLE_ON_SUCCESS. Until that lands, every per-param
 * allow-list saves at least one user incident's worth of $0.05.
 *
 * **Blob dependency:** Supported `gpt-image-*` models return base64-only
 * payloads (no hosted `url`). `BLOB_READ_WRITE_TOKEN` must be set so a
 * successful OpenAI response can be uploaded and rewritten to dall-e-shaped
 * `{ data: [{ url }] }` before Audric consumes it (`CardPreview`,
 * `compose_pdf`, `compose_image_grid`). See
 * `lib/openai-image-blob-normalize.ts`.
 */
export const POST = chargeProxy(
  '0.05',
  'https://api.openai.com/v1/images/generations',
  {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  {
    validate: (body) =>
      validateImagesGenerationsBody(body, {
        blobToken:
          typeof process.env.BLOB_READ_WRITE_TOKEN === 'string'
            ? process.env.BLOB_READ_WRITE_TOKEN.trim() || undefined
            : undefined,
      }),
    transformUpstreamResponse: transformOpenAiImageGenerationsResponse,
  },
);
