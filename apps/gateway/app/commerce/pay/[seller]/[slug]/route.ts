import { handle } from '../handler';

// Store v2 Phase 1 (SPEC_STORE_V2 §5) — slug-addressed service buy URL:
// POST /commerce/pay/{seller}/{slug}. Resolves the SKU's price + delivery
// (per-slug wrap config or the service's own endpoint) and runs the same
// collect → deliver → settle-or-refund flow as the bare URL (which keeps
// serving the seller's DEFAULT service unchanged).

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

async function withSlug(
  req: Request,
  ctx: { params: Promise<{ seller: string; slug: string }> },
): Promise<Response> {
  const { seller, slug } = await ctx.params;
  const clean = slug.trim().toLowerCase();
  if (!SLUG_RE.test(clean)) {
    return Response.json({ error: 'Invalid service slug.' }, { status: 400 });
  }
  return handle(req, seller, clean);
}

export function GET(
  req: Request,
  ctx: { params: Promise<{ seller: string; slug: string }> },
) {
  return withSlug(req, ctx);
}
export function POST(
  req: Request,
  ctx: { params: Promise<{ seller: string; slug: string }> },
) {
  return withSlug(req, ctx);
}
