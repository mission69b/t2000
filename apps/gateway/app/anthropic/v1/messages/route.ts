import { chargeProxy } from '@/lib/gateway';

/**
 * Anthropic Messages API (claude-* models) — SPEC 26 P6 settle-on-success.
 *
 * ## Why no custom classifier
 *
 * Anthropic's HTTP layer is strictly all-or-nothing: 2xx returns a fully
 * usable `{ id, content, usage, stop_reason }` envelope; any failure
 * surfaces at the HTTP status line (400 invalid model, 401 auth, 429
 * rate limit, 5xx server error). There is no analogue to the OpenAI
 * `data: [{ url }, { error }]` partial-array shape that drove
 * `classifyOpenAiImagesResponse` — no `n>1` knob exists, no batch
 * delivery, no "some succeeded some failed" body. A 200 with
 * `stop_reason: 'max_tokens' | 'pause_turn' | 'refusal'` is still a
 * deliverable response (the user got tokens back, anthropic charges
 * us full price), so the default classifier (`res.ok ? deliverable :
 * refundable`) is the correct verdict generator.
 *
 * If anthropic ever ships a partial-success response shape (e.g. a
 * batch endpoint), this route MUST opt into a per-route classifier
 * before that endpoint is enabled. Today it cannot happen at this URL.
 */
export const POST = chargeProxy(
  '0.01',
  'https://api.anthropic.com/v1/messages',
  {
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  },
  {
    settleOnSuccess: true,
  },
);
