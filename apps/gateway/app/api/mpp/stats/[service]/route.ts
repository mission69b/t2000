import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*' };

/**
 * Per-service receipts summary — feeds the listing-page reputation strip on
 * agents.t2000.ai (sold · buyers · settled) + its "every sale, on-chain"
 * activity rows. Every number derives from the payment ledger (proxied rows
 * from the gateway itself, direct-seller rows chain-verified via
 * /api/mpp/report) — receipts, not reviews.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ service: string }> },
) {
  const { service } = await params;

  const [sold, distinctSenders, rows, recent] = await Promise.all([
    prisma.mppPayment.count({ where: { service } }),
    prisma.mppPayment.findMany({
      where: { service, sender: { not: null } },
      distinct: ['sender'],
      select: { sender: true },
    }),
    prisma.mppPayment.findMany({
      where: { service },
      select: { amount: true },
    }),
    prisma.mppPayment.findMany({
      where: { service },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        endpoint: true,
        amount: true,
        digest: true,
        sender: true,
        createdAt: true,
      },
    }),
  ]);

  const settled = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  return Response.json(
    {
      service,
      sold,
      buyers: distinctSenders.length,
      settledUsd: settled.toFixed(2),
      recent,
    },
    { headers: CORS },
  );
}
