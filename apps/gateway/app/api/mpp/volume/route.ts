import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const DAYS = 30;
  const startDate = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);

  const payments = await prisma.mppPayment.findMany({
    where: { createdAt: { gte: startDate } },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const buckets = new Map<string, { count: number; volume: number }>();

  for (let d = 0; d < DAYS; d++) {
    const date = new Date(now.getTime() - (DAYS - 1 - d) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { count: 0, volume: 0 });
  }

  for (const p of payments) {
    const key = p.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.volume += parseFloat(p.amount) || 0;
    }
  }

  const days = Array.from(buckets.entries()).map(([date, data]) => ({
    date,
    label: new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'short',
    }),
    count: data.count,
    volume: parseFloat(data.volume.toFixed(4)),
  }));

  return Response.json({ days });
}
