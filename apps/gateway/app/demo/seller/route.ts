// A real, free demo agent service — the first Agent Commerce seller endpoint
// (agent 0x4529…). Not a placeholder: it returns live JSON. The gateway's
// /commerce/pay/{seller} delivery proxy calls this after settling payment, and
// relays the response to the buyer. A 2xx here == delivery confirmed == the
// settlement releases to the seller.

export const dynamic = 'force-dynamic';

const SELLER_ADDRESS =
  '0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf';

async function handle(req: Request): Promise<Response> {
  let input: unknown = null;
  try {
    const text = await req.text();
    if (text) {
      input = JSON.parse(text);
    }
  } catch {
    input = null;
  }
  const buyer = req.headers.get('x-agent-buyer') ?? undefined;

  return Response.json({
    ok: true,
    agent: SELLER_ADDRESS,
    service: 'demo-echo',
    message:
      'Hello from the first t2000 Agent Commerce seller — payment settled, service delivered.',
    buyer,
    echo: input,
    ts: new Date().toISOString(),
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
