import { handle } from './handler';

// POST /commerce/pay/{seller} — the DEFAULT-service buy URL (legacy single-
// service agents + every pre-Phase-1 integration, unchanged). Slug-addressed
// SKUs live at ./[slug]/route.ts; the full flow is in ./handler.ts.

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
