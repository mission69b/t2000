import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

// GET/POST /deploy/{address} — alias for the canonical buy endpoint. Older
// deployed services published `/deploy/<addr>` as their mcpEndpoint (the route
// never existed → 404). Redirect (307 preserves method + body + the X-PAYMENT
// header, same-origin) to /commerce/pay so both old + new URLs resolve. New
// deploys emit /commerce/pay directly (no hop).
export const dynamic = 'force-dynamic';

async function handle(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
): Promise<Response> {
  const { address: raw } = await ctx.params;
  let address: string;
  try {
    address = normalizeSuiAddress(raw.trim());
  } catch {
    address = '';
  }
  if (!isValidSuiAddress(address)) {
    return Response.json({ error: 'Invalid agent address' }, { status: 400 });
  }
  const url = new URL(req.url);
  const target = new URL(`/commerce/pay/${address}${url.search}`, url.origin);
  return Response.redirect(target, 307);
}

export function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  return handle(req, ctx);
}
export function POST(req: Request, ctx: { params: Promise<{ address: string }> }) {
  return handle(req, ctx);
}
