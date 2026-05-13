import { chargeProxy } from '@/lib/gateway';

/**
 * Allow-list of currently-valid OpenAI image models.
 *
 * Why pre-charge validation matters here: `chargeProxy`'s `mppx.charge()`
 * fires the Sui PTB BEFORE invoking the upstream handler. A request with
 * a deprecated model name (e.g. `dall-e-3`, shut down 2026-05-12) would
 * charge the user $0.05 and then 400 from OpenAI with "model does not
 * exist" — leaving the user out the money with no automatic refund (MPP
 * lacks a `refund(digest)` primitive today; tracked separately as
 * `bug_mpp_no_refund_on_failure` in audric-build-tracker.md).
 *
 * The `validate` hook on `chargeProxy` runs BEFORE the charge — returning
 * a 400 here exits early without invoking `mppx.charge()`. So an LLM that
 * sends a stale model name gets a clean error AND gets to keep its $0.05.
 *
 * When OpenAI adds / deprecates models:
 *   1. Update VALID_MODELS below.
 *   2. Update the `model` field's description string in
 *      `apps/gateway/lib/schemas.ts` (keeps the LLM-facing schema honest).
 *   3. Update the `pay_api` tool description in
 *      `packages/engine/src/tools/pay.ts` (the LLM's system prompt source).
 *
 * Three places, one model name. We considered centralizing into a shared
 * `MODEL_REGISTRY` but the engine package can't import from the gateway
 * package (different deploy targets), and a copy-pasted constant in 3
 * files is currently cheaper than a 4th source-of-truth abstraction. If
 * a 4th model registry consumer ever shows up, factor.
 */
const VALID_MODELS = new Set(['gpt-image-1', 'gpt-image-1-mini']);

export const POST = chargeProxy(
  '0.05',
  'https://api.openai.com/v1/images/generations',
  {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  {
    validate: (body) => {
      const model = body.model;
      // Don't validate when model is omitted — OpenAI's API has its own
      // default selection logic and we shouldn't second-guess it. Only
      // gate explicit model names against the allow-list.
      if (model === undefined || model === null || model === '') return null;
      if (typeof model !== 'string') {
        return `Model must be a string. Got: ${typeof model}`;
      }
      if (!VALID_MODELS.has(model)) {
        return `Model "${model}" is not currently supported. Valid models: ${[...VALID_MODELS].join(', ')}. Note: dall-e-3 and dall-e-2 were shut down 2026-05-12.`;
      }
      return null;
    },
  },
);
