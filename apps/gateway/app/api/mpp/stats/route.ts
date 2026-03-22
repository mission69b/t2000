import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [totalPayments, allPayments] = await Promise.all([
    prisma.mppPayment.count(),
    prisma.mppPayment.findMany({
      select: { service: true, amount: true },
    }),
  ]);

  const serviceMap = new Map<string, { count: number; volume: number }>();
  let totalVolume = 0;

  for (const p of allPayments) {
    const amt = parseFloat(p.amount) || 0;
    totalVolume += amt;
    const existing = serviceMap.get(p.service);
    if (existing) {
      existing.count++;
      existing.volume += amt;
    } else {
      serviceMap.set(p.service, { count: 1, volume: amt });
    }
  }

  const services = Array.from(serviceMap.entries())
    .map(([service, { count, volume }]) => ({
      service,
      count,
      volume: volume.toFixed(2),
    }))
    .sort((a, b) => b.count - a.count);

  return Response.json({
    totalPayments,
    totalVolume: totalVolume.toFixed(2),
    services,
  });
}
