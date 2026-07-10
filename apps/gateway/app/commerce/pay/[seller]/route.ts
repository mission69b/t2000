import { handle } from './handler';

// POST /commerce/pay/{seller} — the buy URL for a seller's declared service
// (on-chain mcpEndpoint + priceUsdc). The full flow is in ./handler.ts.

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ seller: string }> },
) {
  const { seller } = await ctx.params;
  return handle(req, seller);
}
export async function POST(
  req: Request,
  ctx: { params: Promise<{ seller: string }> },
) {
  const { seller } = await ctx.params;
  return handle(req, seller);
}
