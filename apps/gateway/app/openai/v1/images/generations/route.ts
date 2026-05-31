import { chargeProxy } from '@/lib/gateway';
import { transformOpenAiImageGenerationsResponse } from '@/lib/openai-image-blob-normalize';
import { validateImagesGenerationsBody } from './validate';
import { env } from '@/lib/env';

/**
 * MPP gateway entrypoint for OpenAI image generations.
 *
 * Charges $0.05 per request and proxies to OpenAI's image-generations
 * endpoint. Pre-charge validation rejects known-bad params (model
 * allow-list, size allow-list, BLOB token check) at zero spend. After
 * a successful upstream response, `transformOpenAiImageGenerationsResponse`
 * normalizes `gpt-image-*` base64 payloads into hosted-URL form so audric's
 * downstream consumers (`CardPreview`, `compose_pdf`, `compose_image_grid`)
 * can render them like dall-e responses.
 *
 * **Blob dependency:** Supported `gpt-image-*` models return base64-only
 * payloads. `BLOB_READ_WRITE_TOKEN` must be set so the transform can
 * upload and rewrite to `{ data: [{ url }] }` shape.
 */
export const POST = chargeProxy(
  'https://api.openai.com/v1/images/generations',
  {
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  },
  {
    validate: (body) =>
      validateImagesGenerationsBody(body, {
        blobToken:
          typeof env.BLOB_READ_WRITE_TOKEN === 'string'
            ? env.BLOB_READ_WRITE_TOKEN.trim() || undefined
            : undefined,
      }),
    transformUpstreamResponse: transformOpenAiImageGenerationsResponse,
  },
);
