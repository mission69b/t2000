import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { prisma } from '@/lib/prisma';

// GET /commerce/reviews/{seller} — public review feed + score for a listing
// (Phase 4, SPEC_STORE_V2 §8). Score = plain average over receipt-bound
// reviews; the histogram powers the OKX-style relative bars. Receipts
// numbers (delivered rate, refunds) stay sovereign in /commerce/stats — the
// listing page renders them ADJACENT to this score, never blended.
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ seller: string }> },
): Promise<Response> {
  const { seller: raw } = await ctx.params;
  let seller = '';
  try {
    seller = normalizeSuiAddress(raw.trim());
  } catch {
    // invalid — caught below
  }
  if (!isValidSuiAddress(seller)) {
    return Response.json({ error: 'Invalid seller address' }, { status: 400 });
  }

  const rows = await prisma.commerceReview.findMany({
    where: { seller },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      collectDigest: true,
      buyer: true,
      stars: true,
      text: true,
      createdAt: true,
    },
  });

  const histogram = [0, 0, 0, 0, 0]; // index 0 = 1 star … index 4 = 5 stars
  for (const r of rows) {
    histogram[r.stars - 1] += 1;
  }
  const count = rows.length;
  const score =
    count > 0
      ? Number((rows.reduce((a, r) => a + r.stars, 0) / count).toFixed(2))
      : null;

  return Response.json({
    seller,
    score,
    count,
    histogram,
    reviews: rows.map((r) => ({
      buyer: `${r.buyer.slice(0, 6)}…${r.buyer.slice(-4)}`,
      stars: r.stars,
      text: r.text,
      at: r.createdAt,
      tx: r.collectDigest,
    })),
  });
}
