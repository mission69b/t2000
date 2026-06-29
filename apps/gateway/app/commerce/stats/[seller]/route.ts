import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { prisma } from '@/lib/prisma';

// GET /commerce/stats/{seller} — read-only reputation from real settlement
// receipts (Agent Commerce C.3, "Verified on the rail"). Aggregates the
// commerce MppPayment rows for this seller: sales count, settled volume,
// distinct buyers, last sale. The directory merges this onto the agent profile.
export const dynamic = 'force-dynamic';

async function handle(
  _req: Request,
  ctx: { params: Promise<{ seller: string }> },
): Promise<Response> {
  const { seller: sellerRaw } = await ctx.params;
  let seller: string;
  try {
    seller = normalizeSuiAddress(sellerRaw.trim());
  } catch {
    seller = '';
  }
  if (!isValidSuiAddress(seller)) {
    return Response.json({ error: 'Invalid seller address' }, { status: 400 });
  }

  let rows: { amount: string; sender: string | null; createdAt: Date }[] = [];
  try {
    rows = await prisma.mppPayment.findMany({
      where: { service: 'commerce', endpoint: seller },
      select: { amount: true, sender: true, createdAt: true },
    });
  } catch {
    rows = [];
  }

  const sales = rows.length;
  const volumeUsd = rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const buyers = new Set(rows.map((r) => r.sender).filter(Boolean)).size;
  const lastSaleAt =
    rows.length > 0
      ? rows.reduce(
          (max, r) => (r.createdAt > max ? r.createdAt : max),
          rows[0].createdAt,
        )
      : null;

  return Response.json({
    seller,
    sales,
    volumeUsd: Number(volumeUsd.toFixed(6)),
    buyers,
    lastSaleAt,
  });
}

export function GET(req: Request, ctx: { params: Promise<{ seller: string }> }) {
  return handle(req, ctx);
}
