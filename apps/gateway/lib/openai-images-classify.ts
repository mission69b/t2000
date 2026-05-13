import type { ClassifyVerdict } from './gateway';

/**
 * # `openai-images-classify` — SPEC 26 D-6 partial-success classifier
 *
 * Per-route classifier for `openai/v1/images/generations` under
 * `settleOnSuccess: true`. Lifted verbatim from spec § 3 D-6 with a
 * thin wrapper for type-safety and a couple of defensive comments.
 *
 * ## What this fixes (vs the default classifier)
 *
 * The default classifier (`DEFAULT_CLASSIFY_RESPONSE` in `gateway.ts`)
 * maps `res.ok ? 'deliverable' : 'refundable'` — fine for routes whose
 * vendor returns "all-or-nothing" responses. OpenAI image gen does NOT.
 * With `n: 4`, OpenAI can return `200 OK` with a body like:
 *
 * ```json
 * { "data": [
 *     { "url": "https://img/1" },
 *     { "url": "https://img/2" },
 *     { "url": "https://img/3" },
 *     { "error": { "code": "rate_limit_exceeded" } }
 * ] }
 * ```
 *
 * Under the default classifier, this gets billed for the full $0.05 × 4
 * = $0.20. The user paid for 4 images and only received 3. Per D-6 we
 * charge only for the delivered fraction: $0.20 × ¾ = $0.15.
 *
 * ## How `'url' in d` works post-transform
 *
 * `transformOpenAiImageGenerationsResponse` (`openai-image-blob-normalize.ts`)
 * runs in the probe phase under settle-on-success (D-5 lock). For each
 * successful entry, it rewrites `b64_json` → Vercel Blob `url`. Failed
 * legs (e.g. `{ error: {...} }`) pass through unchanged with no `url`.
 *
 * So at classifier time, `'url' in d` is the canonical "this leg
 * delivered" check. If anyone ever removes the transform from the
 * route, this classifier appropriately starts refunding (forces
 * a fix rather than silently billing for unusable b64 responses).
 *
 * ## What we DON'T classify
 *
 * - **Network failures** — if the upstream fetch throws, `chargeProxy`
 *   never reaches the classifier (the legacy retry path in
 *   `fetchAndTransformUpstream` returns a 502 or fails outright).
 *   That's a non-charge case by virtue of probe failing, not by virtue
 *   of classifier verdict.
 * - **Body parse failures** — handled by the shared `fetchAndTransformUpstream`
 *   helper; the parsed body arrives as `unknown` and we treat any
 *   non-array `data` as deliverable per the spec.
 *
 * ## Per-route, not registered globally
 *
 * P4 wires this into `app/openai/v1/images/generations/route.ts` via
 * `chargeProxy(... { settleOnSuccess: true, classifyResponse: classifyOpenAiImagesResponse })`.
 * No global registry — each route opts in by importing this directly.
 * Matches the `transformUpstreamResponse` pattern already in use.
 */
export const classifyOpenAiImagesResponse = async (
  res: Response,
  body: unknown,
): Promise<ClassifyVerdict> => {
  if (!res.ok) {
    return { kind: 'refundable', reason: `OpenAI ${res.status}` };
  }

  // Defensive: the spec lifts this as `(body as { data?: unknown[] })?.data`
  // but `unknown` access needs explicit narrowing for TS strict mode.
  const data = isObjectWithDataArray(body) ? body.data : undefined;
  if (!Array.isArray(data)) {
    // No `data` array → not a recognized OpenAI shape. Fall through to
    // deliverable so we charge for whatever did come back; this keeps
    // the classifier permissive for shapes we haven't seen yet.
    return { kind: 'deliverable' };
  }

  const successCount = data.filter(
    (d) => d != null && typeof d === 'object' && 'url' in d,
  ).length;

  if (successCount === 0) {
    // Note: this also catches the `data: []` empty-array case (vendor
    // returned 200 with no images at all). That's correctly refundable
    // — the user got nothing.
    return { kind: 'refundable', reason: 'all-images-failed' };
  }

  if (successCount === data.length) {
    return { kind: 'deliverable' };
  }

  return {
    kind: 'mixed',
    chargedFraction: successCount / data.length,
    reason: `${successCount}/${data.length} images delivered`,
  };
};

function isObjectWithDataArray(value: unknown): value is { data: unknown } {
  return value !== null && typeof value === 'object' && 'data' in value;
}
