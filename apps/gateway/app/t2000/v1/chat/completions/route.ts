import { chargeCustom } from '@/lib/gateway';
import { env } from '@/lib/env';

// t2000 Private Inference — no-key x402 pay-per-call inference (SPEC_AUDRIC_API S.575
// / SPEC_T2000_API_V2 §5). An agent calls this with NO key → 402 → pays USDC →
// the gateway proxies to api.t2000.ai/v1 with its funded service key →
// inference streams. Flat per-call (capped) pricing — consistent with every
// other gateway service; the max-hold+`upto` refund variant (precise per-token,
// frontier/uncapped) is the documented fast-follow.

const PRIVATE_API_BASE = 'https://api.t2000.ai/v1';

// Flat price per call (USDC). Sized so the worst case WITHIN the caps below
// (priciest allowed model × max input × max output) stays under it with margin.
const FLAT_PRICE = '0.05';
// ~6k input tokens. Larger contexts → use an API key on api.t2000.ai (the caps
// are what keep a flat price loss-safe; uncapped precision = the max-hold tier).
const MAX_BODY_BYTES = 24_000;
const MAX_OUTPUT_TOKENS = 4096;

// The no-key tier is the OPEN + CONFIDENTIAL set only — cheap, cappable, and
// exactly the privacy-first models the x402/agent audience wants. Frontier +
// uncertain-priced opens (kimi, qwen3-max) stay key-only (api.t2000.ai) until
// the max-hold tier lands. Conservative subset of api.t2000.ai's live catalog.
const ALLOWED_MODELS = new Set<string>([
  'zai/glm-5.2',
  'deepseek/deepseek-v3.2',
  'openai/gpt-oss-120b',
  'phala/glm-5.2',
  'phala/gpt-oss-120b',
  'phala/deepseek-v3.2',
  'phala/qwen3.5-27b',
  'phala/uncensored-24b',
]);

function price(bodyText: string): string {
  if (bodyText.length > MAX_BODY_BYTES) {
    throw new Error(
      'Context too large for the no-key tier (~6k tokens). Use an API key on api.t2000.ai for larger contexts.',
    );
  }
  let model: unknown;
  try {
    model = (JSON.parse(bodyText || '{}') as { model?: unknown }).model;
  } catch {
    throw new Error('Invalid JSON body.');
  }
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    throw new Error(
      `Model ${typeof model === 'string' ? `"${model}" ` : ''}is not on the no-key x402 tier. Available: ${[...ALLOWED_MODELS].join(', ')}. Frontier / large-context models: use an API key on api.t2000.ai.`,
    );
  }
  return FLAT_PRICE;
}

async function handler(bodyText: string): Promise<Response> {
  const key = env.T2000_PRIVATE_API_KEY;
  if (!key) {
    return Response.json(
      { error: 'The no-key inference tier is temporarily unavailable.' },
      { status: 503 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  // Enforce the output cap (what keeps the flat price loss-safe).
  const requested =
    typeof body.max_tokens === 'number' ? body.max_tokens : MAX_OUTPUT_TOKENS;
  body.max_tokens = Math.min(requested, MAX_OUTPUT_TOKENS);

  const res = await fetch(`${PRIVATE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}

export const POST = chargeCustom(price, handler);
