/**
 * The whole AI backend: relay the chat to the t2000 router and stream the
 * answer back. No SDK, no framework magic — the OpenAI-compatible SSE stream
 * passes through untouched, so you can read every byte of what happens.
 *
 * The key stays server-side. `t2000/auto` picks the cheapest capable model
 * per call; `x-t2000-served-model` is forwarded so the UI can show which.
 */
export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.T2000_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          'Missing T2000_API_KEY — create a free key at agents.t2000.ai/manage and add it to .env.local',
      },
      { status: 500 },
    );
  }

  const { messages } = (await req.json()) as {
    messages: { role: 'user' | 'assistant'; content: string }[];
  };

  const upstream = await fetch('https://api.t2000.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 't2000/auto',
      stream: true,
      messages: [
        { role: 'system', content: 'You are a helpful, concise assistant.' },
        ...messages.slice(-20),
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return Response.json(
      { error: `Router error ${upstream.status}: ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const headers = new Headers({
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
  });
  const served = upstream.headers.get('x-t2000-served-model');
  if (served) headers.set('x-t2000-served-model', served);

  return new Response(upstream.body, { headers });
}
