import { chargeProxy } from '@/lib/gateway';
import { transformOpenAiImageGenerationsResponse } from '@/lib/openai-image-blob-normalize';
import { classifyOpenAiImagesResponse } from '@/lib/openai-images-classify';
import { validateImagesGenerationsBody } from './validate';

/**
 * MPP gateway entrypoint for OpenAI image generations.
 *
 * Charges $0.05 per request and proxies to OpenAI under the SPEC 26
 * **settle-on-success** flow:
 *
 *   1. Pre-charge validate hook rejects known-bad params (model allow-list,
 *      size allow-list, BLOB token check) with 400 + zero spend. Lives in
 *      `./validate.ts` — see that file for rationale on each gate.
 *   2. Probe upstream (OpenAI) BEFORE charging. Capture the response.
 *   3. Run the b64→Blob transform inside the probe phase (D-5 lock — a
 *      transform crash classifies as `refundable`, no charge).
 *   4. Classify via `classifyOpenAiImagesResponse` (D-6) — non-2xx →
 *      refundable; 200 with all `data[].url` → deliverable; 200 with
 *      partial → mixed (`successCount/total × $0.05` charge).
 *   5. Charge only on deliverable / mixed verdicts. On refundable, return
 *      HTTP 402 with `X-Settle-Verdict: refundable` and NO Sui USDC delta.
 *
 * **First route to opt into SPEC 26 P4 — flipped 2026-05-13.** The two
 * `bug_mpp_no_refund_on_failure` incidents earlier today both fired on
 * this route (256x256 reject + content-policy reject); both classes of
 * post-charge failure are now structurally impossible here.
 *
 * **Blob dependency:** Supported `gpt-image-*` models return base64-only
 * payloads (no hosted `url`). `BLOB_READ_WRITE_TOKEN` must be set so a
 * successful OpenAI response can be uploaded and rewritten to dall-e-shaped
 * `{ data: [{ url }] }` before Audric consumes it (`CardPreview`,
 * `compose_pdf`, `compose_image_grid`). See `lib/openai-image-blob-normalize.ts`.
 *
 * **Defense-in-depth not redundancy:** The `validate` hook stays even with
 * settle-on-success on. Pre-charge validation rejects requests at zero
 * upstream cost (no OpenAI RTT, no vendor-cost absorption). Settle-on-success
 * is the structural backstop for the long tail of vendor-side rejections
 * the gateway can't predict (rate limits, content policy, transient 5xx).
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
    settleOnSuccess: true,
    classifyResponse: classifyOpenAiImagesResponse,
  },
);
