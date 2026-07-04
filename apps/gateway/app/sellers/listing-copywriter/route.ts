import { env } from '@/lib/env';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: listing copy generator (S.624 Shelf v4).
// Runs on the t2000 Private API (ZDR) with the gateway's funded service key —
// the buyer's input is processed in-request, not stored, not trained on.
export const dynamic = 'force-dynamic';

const PRIVATE_API_BASE = 'https://api.t2000.ai/v1';
const MODEL = 'openai/gpt-oss-120b';
const MAX_INPUT_CHARS = 2_000;

const SYSTEM = `You write storefront listing copy for agents.t2000.ai — a store where AI agents sell paid API services (USDC per call). House style: plain-spoken, concrete, zero hype words ("revolutionary", "cutting-edge" banned), honest about limits.

Given a seller's description of their service, produce EXACTLY this structure:

NAME OPTIONS: 3 short names (2 words max each, Title Case, no "AI"/"Bot" suffixes).
HOOK: one question-shaped line the buyer would ask themselves (≤90 chars).
WHAT YOU GET: one paragraph (≤60 words) — concrete outputs, inputs if any, honest limits.
TRY IT: one line showing how to call it, with an example input if the service takes one.

Never invent capabilities beyond what the seller described. If the description is too vague to write honest copy, say what's missing instead of guessing.`;

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  if (!env.T2000_PRIVATE_API_KEY) {
    return Response.json(
      { error: 'Copywriter is not configured (missing engine key) — try again later.' },
      { status: 502 },
    );
  }

  let about = '';
  try {
    const body = (await req.json()) as { about?: string };
    about = (body.about ?? '').trim();
  } catch {
    // fall through
  }
  if (about.length < 10) {
    return Response.json(
      {
        error:
          'Describe your service: {"about":"I sell hourly weather forecasts for any city"} (10+ chars).',
      },
      { status: 400 },
    );
  }

  const res = await fetch(`${PRIVATE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.T2000_PRIVATE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: about.slice(0, MAX_INPUT_CHARS) },
      ],
    }),
  });
  if (!res.ok) {
    return Response.json(
      { error: 'Copy engine unavailable — try again shortly. Nothing was generated.' },
      { status: 502 },
    );
  }
  const completion = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const copy = completion.choices?.[0]?.message?.content?.trim();
  if (!copy) {
    return Response.json(
      { error: 'Copy engine returned nothing — try again shortly.' },
      { status: 502 },
    );
  }

  return Response.json({
    report: 'listing-copywriter',
    generatedAt: new Date().toISOString(),
    method:
      'Your service description → store-ready listing copy (name options, hook, what-you-get, try-it) in the agents.t2000.ai house style, generated on the t2000 Private API (ZDR — input processed in-request, not stored, not trained on). Apply with: t2 agent profile --name "…" --description "…".',
    source: 't2000 Private API (zero data retention)',
    input: { about: about.slice(0, 200) },
    copy,
    dataGaps: [],
    read: copy.split('\n').find((l) => l.trim().length > 0)?.slice(0, 120) ?? 'Copy generated.',
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
