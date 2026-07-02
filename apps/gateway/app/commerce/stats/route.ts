import { prisma } from '@/lib/prisma';

// GET /commerce/stats — global Agent Commerce totals + a leaderboard, from the
// settlement ledger. Powers the agents.t2000.ai headline stats + top-sellers board.
// (Per-seller stats live at /commerce/stats/{seller}.)
export const dynamic = 'force-dynamic';

const TOP_N = 8;

export async function GET(): Promise<Response> {
  let allRows: {
    buyer: string;
    seller: string;
    netMicros: number;
    status: string;
  }[] = [];
  try {
    allRows = await prisma.commerceReceipt.findMany({
      // Refunded rows included for the delivered rate (§II.12.B); they are
      // excluded from sales/volume (a refunded purchase is not a sale).
      where: { status: { in: ['settled', 'settlement_due', 'refunded'] } },
      select: { buyer: true, seller: true, netMicros: true, status: true },
    });
  } catch {
    allRows = [];
  }
  const rows = allRows.filter((r) => r.status !== 'refunded');

  const sales = rows.length;
  const volumeUsd = rows.reduce((acc, r) => acc + r.netMicros / 1_000_000, 0);
  const sellers = new Set(rows.map((r) => r.seller)).size;
  const buyers = new Set(rows.map((r) => r.buyer)).size;

  // Leaderboard: top sellers by net earned (+ sales + distinct buyers), with
  // refund counts folded in for the per-seller delivered rate.
  const bySeller = new Map<
    string,
    { net: number; sales: number; refunds: number; buyers: Set<string> }
  >();
  for (const r of allRows) {
    const e =
      bySeller.get(r.seller) ??
      ({ net: 0, sales: 0, refunds: 0, buyers: new Set() } as {
        net: number;
        sales: number;
        refunds: number;
        buyers: Set<string>;
      });
    if (r.status === 'refunded') {
      e.refunds += 1;
    } else {
      e.net += r.netMicros;
      e.sales += 1;
      e.buyers.add(r.buyer);
    }
    bySeller.set(r.seller, e);
  }
  const allSellers = [...bySeller.entries()]
    .map(([seller, e]) => ({
      seller,
      sales: e.sales,
      buyers: e.buyers.size,
      refunds: e.refunds,
      deliveredRate:
        e.sales + e.refunds > 0
          ? Number((e.sales / (e.sales + e.refunds)).toFixed(4))
          : null,
      volumeUsd: Number((e.net / 1_000_000).toFixed(6)),
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);
  const topSellers = allSellers
    .filter((s) => s.sales > 0)
    .slice(0, TOP_N)
    .map(({ seller, sales: s, buyers: b, volumeUsd: v }) => ({
      seller,
      sales: s,
      buyers: b,
      volumeUsd: v,
    }));

  // Per-seller rollup map — powers the storefront grid's sold counts without a
  // per-agent N+1 (agents.t2000.ai joins this against /v1/agents by address).
  const sellerStats: Record<
    string,
    {
      sales: number;
      buyers: number;
      volumeUsd: number;
      refunds: number;
      deliveredRate: number | null;
    }
  > = {};
  for (const s of allSellers) {
    sellerStats[s.seller] = {
      sales: s.sales,
      buyers: s.buyers,
      volumeUsd: s.volumeUsd,
      refunds: s.refunds,
      deliveredRate: s.deliveredRate,
    };
  }

  return Response.json({
    sales,
    volumeUsd: Number(volumeUsd.toFixed(6)),
    sellers,
    buyers,
    topSellers,
    sellerStats,
  });
}
