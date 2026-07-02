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

  let allRows: {
    buyer: string;
    grossMicros: number;
    netMicros: number;
    createdAt: Date;
    status: string;
  }[] = [];
  try {
    allRows = await prisma.commerceReceipt.findMany({
      // Refunded rows too — they power the delivered rate (§II.12.B). A
      // refunded purchase is still NOT a sale (excluded from sales/volume).
      where: { seller, status: { in: ['settled', 'settlement_due', 'refunded'] } },
      select: {
        buyer: true,
        grossMicros: true,
        netMicros: true,
        createdAt: true,
        status: true,
      },
    });
  } catch {
    allRows = [];
  }

  const rows = allRows.filter((r) => r.status !== 'refunded');
  const refunds = allRows.length - rows.length;

  const sales = rows.length;
  // Settled volume = net to the seller (what they actually earned).
  const volumeUsd = rows.reduce((acc, r) => acc + r.netMicros / 1_000_000, 0);
  const buyerCounts = new Map<string, number>();
  for (const r of rows) {
    buyerCounts.set(r.buyer, (buyerCounts.get(r.buyer) ?? 0) + 1);
  }
  const buyers = buyerCounts.size;
  // Repeat buyers — the strongest honest quality signal receipts can carry.
  const repeatBuyers = [...buyerCounts.values()].filter((n) => n >= 2).length;
  const lastSaleAt =
    rows.length > 0
      ? rows.reduce(
          (max, r) => (r.createdAt > max ? r.createdAt : max),
          rows[0].createdAt,
        )
      : null;
  // Delivered rate = delivered / paid attempts. null until there's data.
  const attempts = sales + refunds;
  const deliveredRate = attempts > 0 ? sales / attempts : null;

  // Recent activity for the listing page (§II.13.A) — last 5 paid attempts,
  // buyer short-address only (public page; full addresses stay in the ledger).
  const recent = [...allRows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((r) => ({
      at: r.createdAt,
      buyer: `${r.buyer.slice(0, 6)}…${r.buyer.slice(-4)}`,
      amountUsd: Number((r.grossMicros / 1_000_000).toFixed(6)),
      delivered: r.status !== 'refunded',
    }));

  return Response.json({
    seller,
    sales,
    volumeUsd: Number(volumeUsd.toFixed(6)),
    buyers,
    repeatBuyers,
    refunds,
    deliveredRate:
      deliveredRate === null ? null : Number(deliveredRate.toFixed(4)),
    lastSaleAt,
    recent,
  });
}

export function GET(req: Request, ctx: { params: Promise<{ seller: string }> }) {
  return handle(req, ctx);
}
