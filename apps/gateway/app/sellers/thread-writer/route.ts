import { env } from '@/lib/env';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: report → X thread draft (S.624 Shelf v4).
// Runs on the t2000 Private API (ZDR) — buyer content processed in-request.
export const dynamic = 'force-dynamic';

const PRIVATE_API_BASE = 'https://api.t2000.ai/v1';
const MODEL = 'openai/gpt-oss-120b';
const MAX_INPUT_CHARS = 6_000;

const SYSTEM = `You turn market reports and data into X (Twitter) thread drafts.

Rules:
- 4 to 6 posts, numbered "1/" style, each ≤ 270 characters.
- Post 1 is the hook: the single most surprising or useful number/finding — no throat-clearing.
- One idea per post. Keep EVERY number exactly as given — never round differently, never invent data, never add claims that are not in the input.
- If the input contains a classification or verdict, the thread must state it faithfully, including hedges and limits.
- Plain language, no hashtag spam (max 1 hashtag, only if natural), no emojis unless the input has them.
- End with one post that says what the reader should watch next, drawn from the input.

If the input has too little substance for a thread, say so instead of padding.`;

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }
  if (!env.T2000_PRIVATE_API_KEY) {
    return Response.json(
      { error: 'Thread writer is not configured (missing engine key) — try again later.' },
      { status: 502 },
    );
  }

  let content = '';
  try {
    const body = (await req.json()) as { content?: string };
    content = (body.content ?? '').trim();
  } catch {
    // fall through
  }
  if (content.length < 40) {
    return Response.json(
      {
        error:
          'Paste the report to thread: {"content":"<report JSON or text, 40+ chars>"} — works great on reads bought from this store.',
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
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: content.slice(0, MAX_INPUT_CHARS) },
      ],
    }),
  });
  if (!res.ok) {
    return Response.json(
      { error: 'Thread engine unavailable — try again shortly. Nothing was generated.' },
      { status: 502 },
    );
  }
  const completion = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const thread = completion.choices?.[0]?.message?.content?.trim();
  if (!thread) {
    return Response.json(
      { error: 'Thread engine returned nothing — try again shortly.' },
      { status: 502 },
    );
  }

  return Response.json({
    report: 'thread-writer',
    generatedAt: new Date().toISOString(),
    method:
      'Your report/text → a 4-6 post X thread draft: hook-first, one idea per post, numbers kept exact, no invented claims, ends on what-to-watch. Generated on the t2000 Private API (ZDR — input processed in-request, not stored, not trained on). Output is a DRAFT — you post it yourself.',
    source: 't2000 Private API (zero data retention)',
    thread,
    dataGaps: [],
    read: thread.split('\n').find((l) => l.trim().length > 0)?.slice(0, 120) ?? 'Thread drafted.',
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
