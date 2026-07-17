import { after } from 'next/server';
import { relayCorsHeaders, relayToSeller } from '@/lib/relay';

export const dynamic = 'force-dynamic';

// Direct-seller CORS relay (lib/relay.ts has the full story): browser payers
// can't reach sellers that serve no CORS headers, so they call
// /api/relay/<serviceId>/<path> instead and the gateway forwards to the
// seller's own origin. Payment still settles client → seller through the
// mirrored 402 handshake; the relay holds no funds and takes no margin.

type Params = { params: Promise<{ service: string; path: string[] }> };

async function handle(req: Request, { params }: Params): Promise<Response> {
  const { service, path } = await params;
  const { response, logSettlement } = await relayToSeller(
    req,
    service,
    `/${path.join('/')}`,
  );
  if (logSettlement) after(logSettlement);
  return response;
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: relayCorsHeaders(req) });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
