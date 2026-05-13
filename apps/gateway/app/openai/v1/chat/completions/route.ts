import { chargeProxy } from '@/lib/gateway';

/**
 * OpenAI Chat Completions API (gpt-* models) — SPEC 26 P7 settle-on-success.
 *
 * ## Why no custom classifier
 *
 * Non-streaming chat completions are all-or-nothing at the HTTP layer:
 * 2xx returns a fully usable `{ choices: [...], usage }` envelope; any
 * failure (invalid model, context overflow, rate limit, server error)
 * surfaces at the status line. There is no `n>1 with partial errors`
 * shape — when `n > 1` is requested all choices come back together or
 * none do.
 *
 * The gateway proxies non-streaming responses only (no SSE pass-through),
 * so streamed partial completions aren't a concern at this surface.
 *
 * If a streaming proxy lands here in the future, that endpoint MUST
 * opt into a per-route classifier before settle-on-success can be
 * trusted to handle mid-stream errors correctly.
 */
export const POST = chargeProxy(
  '0.01',
  'https://api.openai.com/v1/chat/completions',
  {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  {
    settleOnSuccess: true,
  },
);
