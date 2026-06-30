import { prisma } from '@/lib/prisma';

// GET /commerce/stats — global Agent Commerce totals + a leaderboard, from the
// settlement ledger. Powers the id.t2000.ai headline stats + top-sellers board.
// (Per-seller stats live at /commerce/stats/{seller}.)
export const dynamic = 'force-dynamic';

const TOP_N = 8;

export async function GET(): Promise<Response> {
  let rows: { buyer: string; seller: string; netMicros: number }[] = [];
  try {
    rows = await prisma.commerceReceipt.findMany({
      where: { status: { in: ['settled', 'settlement_due'] } },
      select: { buyer: true, seller: true, netMicros: true },
    });
  } catch {
    rows = [];
  }

  const sales = rows.length;
  const volumeUsd = rows.reduce((acc, r) => acc + r.netMicros / 1_000_000, 0);
  const sellers = new Set(rows.map((r) => r.seller)).size;
  const buyers = new Set(rows.map((r) => r.buyer)).size;

  // Leaderboard: top sellers by net earned (+ sales + distinct buyers).
  const bySeller = new Map<
    string,
    { net: number; sales: number; buyers: Set<string> }
  >();
  for (const r of rows) {
    const e = bySeller.get(r.seller) ?? { net: 0, sales: 0, buyers: new Set() };
    e.net += r.netMicros;
    e.sales += 1;
    e.buyers.add(r.buyer);
    bySeller.set(r.seller, e);
  }
  const topSellers = [...bySeller.entries()]
    .map(([seller, e]) => ({
      seller,
      sales: e.sales,
      buyers: e.buyers.size,
      volumeUsd: Number((e.net / 1_000_000).toFixed(6)),
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, TOP_N);

  return Response.json({
    sales,
    volumeUsd: Number(volumeUsd.toFixed(6)),
    sellers,
    buyers,
    topSellers,
  });
}
