// t2000 Private API — model catalog passthrough (free, no charge). Mirrors the
// public api.t2000.ai/v1/models so x402 agents can discover available models
// before paying. The no-key x402 chat tier serves the open + confidential subset.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const res = await fetch('https://api.t2000.ai/v1/models', {
      next: { revalidate: 300 },
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return Response.json({ error: 'Catalog unavailable.' }, { status: 502 });
  }
}
